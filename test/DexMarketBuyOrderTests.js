const Dex = artifacts.require("Dex")
const Link = artifacts.require("Link")

const truffleAssert = require("truffle-assertions")

let Side = {
    BUY: 0,
    SELL: 1,
}

let OrderType = {
    LIMIT: 0,
    MARKET: 1,
}

contract("Dex - Market BUY Orders Tests", accounts => {

    beforeEach(async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()
        let ticker = web3.utils.fromUtf8("LINK")
        await dex.clear()
        await dex.addToken(ticker, link.address)
        await link.transfer(accounts[1], 500)
    })


    it("A BUY market order is reverted when the account has no ETH", async () => {
        let dex = await Dex.deployed()
        let ticker = web3.utils.fromUtf8("LINK")
        
        let ethBalance = (await dex.getEthBalance()).toNumber()
        assert.equal(ethBalance, 0, "Account should have no ETH")
        
        let amount = 100
        await truffleAssert.reverts(
            dex.createMarketOrder(Side.BUY, ticker, amount)
        )
    })

  
    it("A BUY market order can be created even if the orderbook is empty", async () => {
        let dex = await Dex.deployed()
        // let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let amount = 20 
    
        // await link.approve(dex.address, amount)
        await dex.depositEth({value: 1000})

        let orderbook = await dex.getOrderBook(ticker, Side.BUY)
        assert.equal(orderbook.length, 0, "Buy side of orderbook is not empty")
        
        await truffleAssert.passes(
            dex.createMarketOrder(Side.BUY, ticker, amount)
        )
    })


    it("A BUY market order gets 100% filled when its amount is <= the total SELL orders available in the orderbook", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let sellAmount = 30 
        let buyAmount = 10
        let price = 5 

        // add SELL limit order to the orderbook by accounts[1]}
        await link.approve(dex.address, sellAmount, {from: accounts[1]})
        await dex.deposit(sellAmount, ticker, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellAmount, price, {from: accounts[1]})

        // create BUY market order by accounts[0]
        let depositAmount = buyAmount * price
        await link.approve(dex.address, depositAmount)
        await dex.depositEth({value: depositAmount})
        await dex.createMarketOrder(Side.BUY, ticker, buyAmount)
   
        // verify BUY order is filled
        let orders = await dex.getOrders(ticker)
        assert.equal(orders.length, 1, "Expecting 1 order but "+orders.length+" were found")

        let order = orders[0];
        assert.equal(order.orderType, OrderType.MARKET, "Invalid order type")
        assert.equal(order.side, Side.BUY, "Invalid order side")
        assert.equal(order.amount, buyAmount, "Invalid order amount")
        assert.equal(order.amountFilled, buyAmount, "Order not 100% filled")
    })


    it("A BUY market order reduces the ETH balance of its account by the amount filled", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let amount = 20 
        let price = 20 

        // add SELL limit order to the orderbook by accounts[1]
        await link.approve(dex.address, amount, {from: accounts[1]})
        await dex.deposit(amount, ticker, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, amount, price, {from: accounts[1]})
        
        // deposit 1000 wei into accounts[0]
        let depositAmount = 1000
        await link.approve(dex.address, depositAmount)
        await dex.depositEth({value: depositAmount})
        let ethBalanceBefore = (await dex.getEthBalance()).toNumber()
        
        // create BUY market order by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, amount)

        // veify ETH balance of accounts[0]
        let ethBalanceAfter = (await dex.getEthBalance()).toNumber()
        let expectedEthBalance = ethBalanceBefore - (amount * price)
        assert.equal(ethBalanceAfter, expectedEthBalance, "Invalid ETH balance after market oder filled")
    })


    it("A BUY market order adjusts the buyer and seller token balance by the amount filled", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let buyOrderAmount = 20; let sellOrderAmount = 100 
        let price = 20 

        // add SELL limit order to the orderbook by accounts[1]
        await link.approve(dex.address, sellOrderAmount, {from: accounts[1]})
        await dex.deposit(sellOrderAmount, ticker, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})
        let sellerTokenBalanceBefore = (await dex.getTokenBalance(ticker, {from: accounts[1]})).toNumber()

        // deposit 1000 wei into accounts[0]
        let depositAmount = 1000
        await link.approve(dex.address, depositAmount)
        await dex.depositEth({value: depositAmount})
        let buyerTokenBalanceBefore = (await dex.getTokenBalance(ticker)).toNumber()
        
        // create BUY market order by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)

        // veify buyer token balance
        let buyerTokenBalanceAfter = (await dex.getTokenBalance(ticker)).toNumber()
        let expectedBuyerTokenBalance = buyerTokenBalanceBefore + buyOrderAmount
        assert.equal(buyerTokenBalanceAfter, expectedBuyerTokenBalance, "Invalid buyer token balance after market order filled")

        // veify seller token balance
        let sellerTokenBalanceAfter = (await dex.getTokenBalance(ticker, {from: accounts[1]} )).toNumber()
        let expectedSellerTokenBalance = sellerTokenBalanceBefore - buyOrderAmount
        assert.equal(sellerTokenBalanceAfter, expectedSellerTokenBalance, "Invalid seller token balance after market oder filled")
    })


    it("A BUY mnarket order adjusts the buyer and seller ETH balance by the amount filled", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")

        let buyOrderAmount = 30; let sellOrderAmount = 100 
        let price = 20 

        // add SELL limit order to the orderbook by accounts[1]
        await link.approve(dex.address, sellOrderAmount, {from: accounts[1]})
        await dex.deposit(sellOrderAmount, ticker, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})
        let sellerEthBalanceBefore = (await dex.getEthBalance({from: accounts[1]})).toNumber()

        // deposit 1000 wei into accounts[0]
        let depositAmount = 1000
        await link.approve(dex.address, depositAmount)
        await dex.depositEth({value: depositAmount})
        let buyerEthBalanceBefore = (await dex.getEthBalance()).toNumber()
        
        // create BUY market order by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)

        // veify buyer ETH balance
        let buyerEthBalanceAfter = (await dex.getEthBalance()).toNumber()
        let expectedBuyerEthBalance = buyerEthBalanceBefore - (buyOrderAmount * price) // order fully filled
        assert.equal(buyerEthBalanceAfter, expectedBuyerEthBalance, "Invalid buyer ETH balance after market oder filled")

        // veify seller ETH balance
        let sellerEthBalanceAfter = (await dex.getEthBalance({from: accounts[1]})).toNumber()
        let expectedSellerEthBalance = sellerEthBalanceBefore + (buyOrderAmount * price) // order fully filled
        assert.equal(sellerEthBalanceAfter, expectedSellerEthBalance, "Invalid seller ETH balance after market oder filled")
    })


    it("A BUY market order increases the filled amount of the matching SELL order by its filled amount", async () => { 
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let buyOrderAmount = 20; let sellOrderAmount = 100 
        let price = 20 

        // add SELL limit order to the orderbook by accounts[1]
        await link.approve(dex.address, sellOrderAmount, {from: accounts[1]})
        await dex.deposit(sellOrderAmount, ticker, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})

        // deposit 1000 wei into accounts[0]
        let depositAmount = 1000
        await link.approve(dex.address, depositAmount)
        await dex.depositEth({value: depositAmount})
        
        // create BUY market order by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)

        // verify the BUY market order is fully filled
        let orders = await dex.getOrders(ticker)
        assert.equal(orders.length, 1, "Expecting 1 order but "+orders.length+" were found")

        let buyOrder = orders[0]
        assert.equal(buyOrder.amount, buyOrderAmount, "Invalid BUY order amount")
        assert.equal(buyOrder.amountFilled, buyOrder.amount, "Invalid BUY order filled amount")

        // veify SELL limit order was partially filled 
        let sellOrders = await dex.getOrderBook(ticker, Side.SELL)
        let sellOrder = sellOrders[0]
        assert.equal(sellOrders.length, 1, "Expecting 1 sell order but "+sellOrder.length+" were found")

        assert.equal(sellOrder.amount, sellOrderAmount, "Invalid SELL order amount")
        assert.equal(sellOrder.amountFilled, buyOrderAmount, "Invalid SELL order filled amount")
    })


    it("A BUY market order causes the limit SELL orders that are fully filled to be removed from the orderbook", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let buyOrderAmount = 15; let sellOrderAmount = 10 
        let price = 20 

        // add 2 SELL limit orders to the orderbook by accounts[1]
        await link.approve(dex.address, sellOrderAmount * 2, {from: accounts[1]})
        await dex.deposit(sellOrderAmount * 2, ticker, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})

        // deposit 1000 wei into accounts[0]
        let depositAmount = 1000
        await link.approve(dex.address, depositAmount)
        await dex.depositEth({value: depositAmount})
        
        // create BUY market order by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)

        // veify 1st SELL order, that was fully filled, was removed from the orderbook 
        let orders = await dex.getOrderBook(ticker, Side.SELL)
        assert.equal(orders.length, 1, "Invalid number of SELL orders in orderbook")
    })


    it("When a BUY market order amount is greater than the total amount in the orderbook's sell orders, the orderbook is emptied", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let buyOrderAmount = 30; let sellOrderAmount = 10 
        let price = 20 

        // add 2 SELL limit orders to the orderbook by accounts[1]
        await link.approve(dex.address, sellOrderAmount * 2, {from: accounts[1]})
        await dex.deposit(sellOrderAmount * 2, ticker, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})

        // deposit 1000 wei into accounts[0]
        let depositAmount = 1000
        await link.approve(dex.address, depositAmount)
        await dex.depositEth({value: depositAmount})
        
        // create BUY market order by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)

        // verity there are no orders in orderbook
        let orders = await dex.getOrderBook(ticker, Side.SELL)
        assert.equal(orders.length, 0, "Invalid number of SELL orders in orderbook")
    })


    it("BUY market orders should fill the remaining part of partially filled limit SELL orders", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let buyOrderAmount = 15; let sellOrderAmount = 20 
        let price = 20 

        // add 3 SELL limit orders to the orderbook by accounts[1]
        await link.approve(dex.address, sellOrderAmount * 3, {from: accounts[1]})
        await dex.deposit(sellOrderAmount * 3, ticker, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})

        // deposit 1000 wei into accounts[0]
        let depositAmount = 1000
        // await link.approve(dex.address, depositAmount * 3)
        await dex.depositEth({value: depositAmount})
        
        // create 1st BUY market order by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)

        // veify 1st SELL order was partially filled 
        let orders = await dex.getOrderBook(ticker, Side.SELL)
        assert.equal(orders.length, 3, "Invalid number of SELL orders in orderbook")
        assert.equal(orders[orders.length-1].amountFilled, 15, "Invalid filled amount in 1st order")

        // create 2st BUY market order by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)

        // veify 2nd SELL order was partially filled 
        orders = await dex.getOrderBook(ticker, Side.SELL)
        assert.equal(orders.length, 2, "Invalid number of SELL orders in orderbook")
        assert.equal(orders[orders.length-1].amountFilled, 10, "Invalid filled amount in 1st order")

        // create 3st BUY market order by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)

        // veify 3nd SELL order was partially filled 
        orders = await dex.getOrderBook(ticker, Side.SELL)
        assert.equal(orders.length, 1, "Invalid number of SELL orders in orderbook")
        assert.equal(orders[orders.length-1].amountFilled, 5, "Invalid filled amount in 1st order")
    })


    it("Limit SELL orders that are completely filled should be moved to the order history", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let buyOrderAmount = 20; let sellOrderAmount = 15 
        let price = 20 

        // add 3 SELL limit orders to the orderbook by accounts[1]
        await link.approve(dex.address, sellOrderAmount * 3, {from: accounts[1]})
        await dex.deposit(sellOrderAmount * 3, ticker, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.SELL, ticker, sellOrderAmount, price, {from: accounts[1]})

        // deposit 1000 wei into accounts[0]
        let depositAmount = 1000
        await link.approve(dex.address, depositAmount)
        await dex.depositEth({value: depositAmount})
        
        // create 3 BUY market orders by accounts[0]
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)
        await dex.createMarketOrder(Side.BUY, ticker, buyOrderAmount)

        // veify SELL orderbook has 0 orders left
        let sellOrders = await dex.getOrderBook(ticker, Side.SELL)
        assert.equal(sellOrders.length, 0, "Invalid number of SELL orders in orderbook")

        // veify filled limit orders are available in order history for limit buyer
        let ordersAccount1 = await dex.getOrders(ticker, {from: accounts[1]} )
        assert.equal(ordersAccount1.length, 3, "Invalid number of limit orders in order history")
        assert.equal(ordersAccount1[0].amountFilled, ordersAccount1[0].amount, "Invalid amountFilled in limit order in order history")
        assert.equal(ordersAccount1[1].amountFilled, ordersAccount1[1].amount, "Invalid amountFilled in limit order in order history")
        assert.equal(ordersAccount1[2].amountFilled, ordersAccount1[1].amount, "Invalid amountFilled in limit order in order history")

        // veify market orders are available in order history for market buyer
        let ordersAccount0 = await dex.getOrders(ticker)
        assert.equal(ordersAccount0.length, 3, "Invalid number of market orders in order history")
        assert.equal(ordersAccount0[0].amountFilled, 20, "Invalid filled amount in market order in order history")
        assert.equal(ordersAccount0[1].amountFilled, 20, "Invalid filled amount in market order in order history")
        assert.equal(ordersAccount0[2].amountFilled, 5, "Invalid filled amount in market order in order history")
    })

})
