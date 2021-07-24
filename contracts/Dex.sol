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
    mapping (address => mapping(bytes32 => uint256)) public reservedBalances; // tokens reserverd to execute limit orders
    mapping (address => bool) public tradersAddresses; // the addresses of every trader that submitted orders 
    address[] public tradersArray; // the addresses of every trader that submitted orders 
    uint256 public nextCounterId = 0;


    function getOrderBook(bytes32 ticker, Side side) view external returns (Order[] memory) {
        return orderBook[ticker][side];
    }

    function getOrders(bytes32 ticker) view external returns (Order[] memory) {
        return orderHistory[ticker][msg.sender];
    }

    function getReservedTokenBalance(bytes32 ticker) tokenExists(ticker) external view returns (uint256) {
        return reservedBalances[msg.sender][ticker];
    }

    function getReservedEthBalance() public view returns (uint){
        return reservedBalances[msg.sender][bytes32("ETH")];
    }

    function createLimitOrder(Side side, bytes32 ticker, uint256 amount, uint256 price) public returns (uint256) {

        // reserve eth to execute limit BUY order
        if (side == Side.BUY) {
            bytes32 eth = bytes32("ETH");
            uint256 ethBalance = balances[msg.sender][eth];
            uint256 orderCost = amount.mul(price);
            require( ethBalance >= orderCost, "Insufficient ETH balance");

            balances[msg.sender][eth] = balances[msg.sender][eth].sub(orderCost);
            reservedBalances[msg.sender][eth] = reservedBalances[msg.sender][eth].add(orderCost);
        }

        // reserve tokens to execute limit SELL order
        if (side == Side.SELL) {
            uint256 tokenBalance = balances[msg.sender][ticker];
            require( tokenBalance >= amount, "Insufficient token balance");

            balances[msg.sender][ticker] = balances[msg.sender][ticker].sub(amount);
            reservedBalances[msg.sender][ticker] = reservedBalances[msg.sender][ticker].add(amount);
        }

        // create limit order
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

        // add limit order to orderbook
        _addLimitOrder(order, side, ticker);

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
            require( ethBalance > 0, "Insufficient ETH balance");
        }

        if (side == Side.SELL) {
            uint256 tokenBalance = balances[msg.sender][ticker];
            require( tokenBalance >= amount, "Insufficient token balance");
        }

        Side bookSide = (side == Side.BUY)? Side.SELL : Side.BUY;
        Order[] storage orders = orderBook[ticker][bookSide];
        
        uint256 amountFilled = _processOrders(bookSide, orders, amount);

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
        orderHistory[order.ticker][order.trader].push(order);
        nextCounterId++;

        // remember this trader address
        if (tradersAddresses[msg.sender] == false) {
            tradersArray.push(msg.sender);
            tradersAddresses[msg.sender] = true;
        }

        return order.id;
    }


    // reset internal data structures (used in tests)
    function clear()  onlyOwner public {
        _clearOrderBook();
        _clearBalances();
        _clearOrders();
        _clearTokens();
        _clearTraderAddresses();
        nextCounterId = 0;
    }


    // add a limit order to the orderbook.
    // buy orders (bids) are sorted in ascending price order and sell orders (asks) sorted in descending price order.
    // this is to allow to match market orders against limit  orders processing both buy/sell orders array from the last item to the first.
    function _addLimitOrder(Order memory order, Side bookSide, bytes32 ticker) private {
        Order[] storage orders = orderBook[ticker][bookSide];
        orders.push(order);
        if (bookSide == Side.BUY) _sortAsc(orders); else _sortDesc(orders);
    }


    function _processOrders(Side side, Order[] storage orders, uint marketOrderAmount) private returns(uint256) {
        if (orders.length == 0) return 0;
        uint256 amountFilled = 0;

        for (uint256 i=orders.length; i > 0 && amountFilled < marketOrderAmount; i--) {
            Order storage order = orders[i-1];

            // get buyer and seller accounts 
            //(address buyerAddress, address sellerAddress) = (msg.sender, order.trader);

            // calcualte how much of this limit order can be filled (remainingAmountFillable) as the min of: 
            // 1. the amount still available to be filled in this limit order (orderAvailableAmount)
            // 2. the remaining part of the market order yet to be filled (remainingAmountToFill)
            uint256 orderAvailableAmount = order.amount - order.amountFilled;
            uint256 remainingAmountToFill = marketOrderAmount.sub(amountFilled);
            uint256 remainingAmountFillable = Math.min(orderAvailableAmount, remainingAmountToFill);

            // increment the amountFilled of this buy order by `remainingAmountFillable` (e.g the additional amount filled in the limit order) 
            order.amountFilled = order.amountFilled.add(remainingAmountFillable);
            require(order.amountFilled <= order.amount, "Amount filled exceeds limit order amount");

            uint256 remainingAmountFillableEthCost = remainingAmountFillable.mul(order.price);
            (address buyerAddress, address sellerAddress) = (side == Side.BUY)? (order.trader, msg.sender) : (msg.sender, order.trader);

            // execute the trade 
            // 1. decrease buyer ETH balance
            mapping (address => mapping(bytes32 => uint256)) storage buyerBalances = (side == Side.BUY) ? reservedBalances: balances;
            buyerBalances[buyerAddress][bytes32("ETH")] = buyerBalances[buyerAddress][bytes32("ETH")].sub(remainingAmountFillableEthCost);
            // 2. decrease seller tokens
            mapping (address => mapping(bytes32 => uint256)) storage sellerBalances = (side == Side.BUY) ? balances: reservedBalances;
            sellerBalances[sellerAddress][order.ticker] = sellerBalances[sellerAddress][order.ticker].sub(remainingAmountFillable);
            // 3. increase buyer tokens
            balances[buyerAddress][order.ticker] = balances[buyerAddress][order.ticker].add(remainingAmountFillable);
            // 4. increase seller ETH balance
            balances[sellerAddress][bytes32("ETH")] = balances[sellerAddress][bytes32("ETH")].add(remainingAmountFillableEthCost);

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


    //// orderbook sorting functions 
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


    ///// functions to reset data structures (used in tests)
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
                reservedBalances[traderAddress][token] = 0;
            }
        }

        for(uint j=0; j<tradersArray.length; j++) {
            address traderAddress = tradersArray[j];
            balances[traderAddress][bytes32("ETH")] = 0;
            reservedBalances[traderAddress][bytes32("ETH")] = 0;
        }
    }

}