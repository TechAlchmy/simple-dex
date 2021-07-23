// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "./Wallet.sol";
import "../node_modules/@openzeppelin/contracts/utils/math/Math.sol";

contract Dex is Wallet {

    using SafeMath for uint256;
    using Math for uint256;

    enum Side { BUY, SELL }
    enum OrderType { LIMIT, MARKET }

    struct Order {
        uint256 id;
        OrderType orderType;
        address trader;
        Side side;
        bytes32 ticker;
        uint256 amount;
        uint256 amountFilled;
        uint256 price;
    }

    mapping (bytes32 => mapping (Side => Order[])) public orderBook;
    mapping (bytes32 => mapping (address => Order[])) public orderHistory;

    mapping (address => bool) public tradersAddresses; // the addresses of every trader that submitted orders 
    address[] public tradersArray; // the addresses of every trader that submitted orders 

    uint256 public nextCounterId = 0;

    function getOrderBook(bytes32 ticker, Side side) view external returns (Order[] memory) {
        return orderBook[ticker][side];
    }

    function getOrders(bytes32 ticker) view external returns (Order[] memory) {
        return orderHistory[ticker][msg.sender];
    }

    function createLimitOrder(Side side, bytes32 ticker, uint256 amount, uint256 price) public returns (uint256) {

        if (side == Side.BUY) {
            uint256 ethBalance = balances[msg.sender][bytes32("ETH")];
            require( ethBalance >= amount.mul(price), "Insufficient ETH balance to buy tokens");
        }

        if (side == Side.SELL) {
            uint256 tokenBalance = balances[msg.sender][ticker];
            require( tokenBalance >= amount, "Insufficient balance of token to sell");
        }

        Order[] storage orders = orderBook[ticker][side];
        Order memory order = Order(
            nextCounterId,
            OrderType.LIMIT,
            msg.sender,
            side,
            ticker,
            amount,
            0,
            price
        );
        orders.push(order);

        if (side == Side.BUY) {
            // buy orders are ordered by ascending prices
            _sortAsc(orders);
        } else if (side == Side.SELL) {
            // sell orders are ordered by descending prices
            _sortDesc(orders);
        }

        // remember this trader address
        if (tradersAddresses[msg.sender] == false) {
            tradersArray.push(msg.sender);
            tradersAddresses[msg.sender] = true;
        }

        // increment order sequence
        nextCounterId++;

        return order.id;
    }


    function createMarketOrder(Side side, bytes32 ticker, uint256 amount) public returns (uint256) {

        if (side == Side.BUY) {
            uint256 ethBalance = balances[msg.sender][bytes32("ETH")];
            require( ethBalance > 0, "Insufficient ETH balance to buy tokens");
        }

        if (side == Side.SELL) {
            uint256 tokenBalance = balances[msg.sender][ticker];
            require( tokenBalance >= amount, "Insufficient balance of token to sell");
        }

        Side bookSide = (side == Side.BUY)? Side.SELL : Side.BUY;
        Order[] storage orders = orderBook[ticker][bookSide];
        
        uint256 amountFilled = 0;
        if(bookSide == Side.BUY) {
             amountFilled = _processBids(orders, amount);
        } else {
            amountFilled = _processAsks(orders, amount);
        }
        
        // add market oredr to order history
        Order memory order = Order(
                nextCounterId,
                OrderType.MARKET,
                msg.sender,
                side,
                ticker,
                amount,
                amountFilled,
                0
        );
        _addToOrderHistory(order);
        nextCounterId++;

        // remember this trader address
        if (tradersAddresses[msg.sender] == false) {
            tradersArray.push(msg.sender);
            tradersAddresses[msg.sender] = true;
        }

        return order.id;
    }

    
    // bids (aka buy orders) are processed from the highest price to the lowest 
    // which means from the last to the first order in the orders array.
    function  _processBids(Order[] storage orders, uint sellOrderAmount) private returns(uint256) {

        if (orders.length == 0) return 0;
        uint256 amountFilled = 0;

        for (uint256 i=orders.length; i > 0 && amountFilled < sellOrderAmount; i--) {
            Order storage order = orders[i-1];

            // get the ETH balance for the account in this buy order
            uint256 ethBalance = balances[order.trader][bytes32("ETH")];

            // calcualte how much of this order can be filled (remainingAmountFillable) as the min of: 
            // 1. the ETH balance in the trader account 
            // 2. the amount still available to be filled in this buy order
            // 3. the remaining part of the market sell order yet to be filled
            uint256 maxSellAmount = ethBalance.div(order.price);

            uint256 orderAvailableAmount = order.amount - order.amountFilled;
            uint256 maxFillable = Math.min(orderAvailableAmount, maxSellAmount);
            uint256 remainingAmountToFill = sellOrderAmount.sub(amountFilled);
            uint256 remainingAmountFillable = Math.min(remainingAmountToFill, maxFillable);

            // increment the amountFilled of this buy order by `remainingAmountFillable` (e.g the additional amount filled in the sell order) 
            order.amountFilled = order.amountFilled.add(remainingAmountFillable);
            require(order.amountFilled <= order.amount, "Amount filled exceeds buy order amount");

            // execute the trade   
            // 1. decrease buyer ETH balance
            uint256 remainingAmountFillableEthCost = remainingAmountFillable.mul(order.price); //20 LINK * 10 wei per 1 LINK = 200 wei
            balances[order.trader][bytes32("ETH")] = balances[order.trader][bytes32("ETH")].sub(remainingAmountFillableEthCost);
            // 2. decrease seller tokens
            balances[msg.sender][order.ticker] = balances[msg.sender][order.ticker].sub(remainingAmountFillable);
            // 3. increase buyer tokens
            balances[order.trader][order.ticker] = balances[order.trader][order.ticker].add(remainingAmountFillable);
            // 4. increase seller ETH balance
            balances[msg.sender][bytes32("ETH")] = balances[msg.sender][bytes32("ETH")].add(remainingAmountFillableEthCost);

            // increment the amountFilled of the buy order with the amount filled in tihs sell order
            amountFilled = amountFilled.add(remainingAmountFillable);
        }

        // remove filled orders from orderbook and move them to order history
        while(orders.length > 0 && orders[orders.length-1].amountFilled == orders[orders.length-1].amount) {
            Order memory order = orders[orders.length-1];
            orderHistory[order.ticker][order.trader].push(order);
            orders.pop();
        }

        return amountFilled;
    }


    // ASKS are ordered in descending price order
    //[10 7]  10 link at 7 eth / link
    //[10 5]
    //[10 3]

    // asks (aka sell orders) are processed from the lowest price to the highest 
    // which means from the last to the first order in the orders array.
    function  _processAsks(Order[] storage orders, uint256 buyOrderAmount) private returns(uint256) {

        if (orders.length == 0) return 0;
        uint256 amountFilled = 0;

        for (uint256 i=orders.length; i > 0 && amountFilled < buyOrderAmount; i--) {
            Order storage order = orders[i-1];

            // get the ETH balance for the account in this buy order
            uint256 ethBalance = balances[msg.sender][bytes32("ETH")];

            // calcualte how much of this order can be filled (remainingAmountFillable) as the min of: 
            // 1. the ETH balance in the trader account 
            // 2. the amount still available to be filled in this sell order
            // 3. the remaining part of the buy order yet to be filled
            uint256 maxBuyAmount = ethBalance.div(order.price);
            uint256 orderAvailableAmount = order.amount - order.amountFilled;
            uint256 maxFillable = Math.min(orderAvailableAmount, maxBuyAmount);
            uint256 remainingAmountToFill = buyOrderAmount.sub(amountFilled);
            uint256 remainingAmountFillable = Math.min(remainingAmountToFill, maxFillable);

            // increment the amountFilled of this sell order by `remainingAmountFillable` (e.g the amount filled in the buy order) 
            order.amountFilled = order.amountFilled.add(remainingAmountFillable);
            require(order.amountFilled <= order.amount, "Amount filled exceeds sell order amount");

            // execute the trade
            // 1. decrease buyer ETH balance
            uint256 ethCost = remainingAmountFillable.mul(order.price);
            balances[msg.sender][bytes32("ETH")] = balances[msg.sender][bytes32("ETH")].sub(ethCost);
            // 2. decrease seller tokens
            balances[order.trader][order.ticker] = balances[order.trader][order.ticker].sub(remainingAmountFillable);
            // 3. increase buyer tokens
            balances[msg.sender][order.ticker] = balances[msg.sender][order.ticker].add(remainingAmountFillable);
            // 4. increase seller ETH balance
            balances[order.trader][bytes32("ETH")] = balances[order.trader][bytes32("ETH")].add(ethCost);

            // increment the amountFilled of the buy order with the amount filled in tihs sell order
            amountFilled = amountFilled.add(remainingAmountFillable);
        }

        // remove filled orders from orderbook and move them to order history
        while(orders.length > 0 && orders[orders.length-1].amountFilled == orders[orders.length-1].amount) {
            Order memory order = orders[orders.length-1];
            orderHistory[order.ticker][order.trader].push(order);
            orders.pop();
        }

        return amountFilled;
    }

    
    function clear()  onlyOwner public {
        _clearOrderBook();
        _clearBalances();
        _clearOrders();
        _clearTokens();
        _clearTraderAddresses();
        nextCounterId = 0;
    }

    function _clearTraderAddresses() private {
        for(uint i=0; i < tradersArray.length; i++) {
            tradersAddresses[tradersArray[i]] = false;
        }
        while(tradersArray.length > 0) {
            tradersArray.pop();
        }
    }

    function _clearOrderBook() onlyOwner internal {
        for (uint i=0; i<tokenList.length; i++) {
            bytes32 token = tokenList[i];
            delete orderBook[token][Side.BUY];
            delete orderBook[token][Side.SELL];
        }
    }

    function _clearOrders() onlyOwner internal {
        for (uint i=0; i<tokenList.length; i++) {
            bytes32 token = tokenList[i];
            for(uint j=0; j<tradersArray.length; j++) {
                address traderAddress = tradersArray[j];
                delete orderHistory[token][traderAddress];
            }
        }
    }

    function _clearBalances() onlyOwner internal {
        for (uint i=0; i<tokenList.length; i++) {
            bytes32 token = tokenList[i];
            for(uint j=0; j<tradersArray.length; j++) {
                address traderAddress = tradersArray[j];
                balances[traderAddress][token] = 0;
            }
        }

        for(uint j=0; j<tradersArray.length; j++) {
            address traderAddress = tradersArray[j];
            balances[traderAddress][bytes32("ETH")] = 0;
        }
    }

    function _sortDesc(Order[] storage orders) private {
        for(uint i=orders.length-1; i>0; i--) {
            if (orders[i-1].price < orders[i].price) {
               _swap(orders, i-1, i);
            } else break;
        }
    }

    function _sortAsc(Order[] storage orders) private {
        for(uint i=orders.length-1; i>0; i--) {
            if (orders[i-1].price > orders[i].price) {
                _swap(orders, i-1, i);
            } else break;
        }
    }

    function _swap(Order[] storage orders, uint256 i, uint256 j) private {
        Order memory tmp = orders[i];
        orders[i] = orders[j];
        orders[j] = tmp;
    }

    function _removeLastItem(Order[] storage orders) private {
        orders.pop();
    }

    function _addToOrderHistory(Order memory order) private {
        orderHistory[order.ticker][order.trader].push(order);
    }
}