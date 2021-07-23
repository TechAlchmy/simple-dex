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

contract("Dex - Market SELL Orders Tests", accounts => {

    beforeEach(async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()
        let ticker = web3.utils.fromUtf8("LINK")
        await dex.clear()
        await dex.addToken(ticker, link.address)
        await link.transfer(accounts[1], 500)
    })


    it("A SELL market order is reverted when its amount is less than the account token balance", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let amount = 20 
        await link.approve(dex.address, amount)
        await dex.deposit(amount, ticker)

        let tokenBalance = (await dex.getTokenBalance(ticker)).toNumber()
        assert.equal(tokenBalance, amount, "Invalid token balance amount")
        
        let sellAmount = 100
        await truffleAssert.reverts(
            dex.createMarketOrder(Side.SELL, ticker, sellAmount)
        )
    })

  
    it("A SELL market order can be created even if the orderbook is empty", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let amount = 20 
        await link.approve(dex.address, amount)
        await dex.deposit(amount, ticker)      

        let orderbook = await dex.getOrderBook(ticker, Side.SELL)
        assert.equal(orderbook.length, 0, "Sell side of orderbook is not empty")
        
        await truffleAssert.passes(
            dex.createMarketOrder(Side.SELL, ticker, amount)
        )
    })


    it("A SELL market order gets 100% filled when its amount is <= the total BUY orders available in the orderbook", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let buyAmount = 30 
        let sellAmount = 10
        let price = 5 

        // add BUY limit order to the orderbook by accounts[1]}
        await dex.depositEth({value: buyAmount * price, from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyAmount, price, {from: accounts[1]})

        // create SELL market order by accounts[0]
        let depositAmount = sellAmount * price
        await link.approve(dex.address, depositAmount)
        await dex.deposit(depositAmount, ticker)
        await dex.createMarketOrder(Side.SELL, ticker, sellAmount)
   
        // verify SELL order is filled
        let orders = await dex.getOrders(ticker)
        assert.equal(orders.length, 1, "Expecting 1 order but "+orders.length+" were found")

        let order = orders[0];
        assert.equal(order.orderType, OrderType.MARKET, "Invalid order type")
        assert.equal(order.side, Side.SELL, "Invalid order side")
        assert.equal(order.amount, sellAmount, "Invalid order amount")
        assert.equal(order.amountFilled, sellAmount, "Order not 100% filled")
    })


    it("A SELL mnarket order reduces the token balance of its account by the amount filled", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let buyAmount = 30 
        let sellAmount = 10
        let price = 5 

        // add BUY limit order to the orderbook by accounts[1]}
        await dex.depositEth({value: buyAmount * price, from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyAmount, price, {from: accounts[1]})

        // create SELL market order by accounts[0]
        let depositAmount = sellAmount * price
        await link.approve(dex.address, depositAmount)
        await dex.deposit(depositAmount, ticker)

        let tokenBalanceBofore = (await dex.getTokenBalance(ticker)).toNumber()
        assert.equal(tokenBalanceBofore, depositAmount, "Invalid token balance")

        await dex.createMarketOrder(Side.SELL, ticker, sellAmount)

        // veify token balance of accounts[0]
        let tokenBalanceAfter = (await dex.getTokenBalance(ticker)).toNumber()
        let expectedTokenBalance = tokenBalanceBofore - sellAmount
        assert.equal(tokenBalanceAfter, expectedTokenBalance, "Invalid token balance after market oder filled")
    })


    it("A SELL market order adjusts the buyer and seller token balance by the amount filled", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let sellAmount = 20; let buyAmount = 100 
        let price = 20 

        // add BUY limit order to the orderbook by accounts[1]
        await dex.depositEth({value: buyAmount * price, from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyAmount, price, {from: accounts[1]})

        let buyerTokenBalanceBefore = (await dex.getTokenBalance(ticker, {from: accounts[1]})).toNumber()
        assert.equal(buyerTokenBalanceBefore, 0, "Invalid buyer token balance")

        // create SELL market order by accounts[0]
        let depositAmount = sellAmount * price
        await link.approve(dex.address, depositAmount)
        await dex.deposit(depositAmount, ticker)

        let sellerTokenBalanceBefore = (await dex.getTokenBalance(ticker)).toNumber()
        assert.equal(sellerTokenBalanceBefore, depositAmount, "Invalid seller token balance")

        await dex.createMarketOrder(Side.SELL, ticker, sellAmount)
  
        // veify buyer token balance
        let buyerTokenBalanceAfter = (await dex.getTokenBalance(ticker, {from: accounts[1]} )).toNumber()
        let expectedBuyerTokenBalance = buyerTokenBalanceBefore + sellAmount
        assert.equal(buyerTokenBalanceAfter, expectedBuyerTokenBalance, "Invalid buyer token balance after market order filled")

        // veify seller token balance
        let sellerTokenBalanceAfter = (await dex.getTokenBalance(ticker)).toNumber()
        let expectedSellerTokenBalance = sellerTokenBalanceBefore - sellAmount
        assert.equal(sellerTokenBalanceAfter, expectedSellerTokenBalance, "Invalid seller token balance after market order filled")
    })


    it("A SELL market order adjusts the buyer and seller ETH balance by the amount filled", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let sellAmount = 20; let buyAmount = 100 
        let price = 20  // wei per 1 link

        // add BUY limit order to the orderbook by accounts[1]
        let depositedEth = buyAmount * price
        await dex.depositEth({value: depositedEth, from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyAmount, price, {from: accounts[1]})

        let buyerEthBalanceBefore = (await dex.getEthBalance({from: accounts[1]})).toNumber()
        assert.equal(buyerEthBalanceBefore, depositedEth, "Invalid buyer ETH balance")

        // create SELL market order by accounts[0]
        let depositAmount = sellAmount * price
        await link.approve(dex.address, depositAmount)
        await dex.deposit(depositAmount, ticker)

        let sellerEthBalanceBefore = (await dex.getEthBalance()).toNumber()
        assert.equal(sellerEthBalanceBefore, 0, "Invalid seller token balance")
        await dex.createMarketOrder(Side.SELL, ticker, sellAmount)
  
        // veify buyer ETH balance
        let buyerEthBalanceAfter = (await dex.getEthBalance({from: accounts[1]})).toNumber()
        let expectedBuyerEthBalance = buyerEthBalanceBefore - (sellAmount * price) // order fully filled
        assert.equal(buyerEthBalanceAfter, expectedBuyerEthBalance, "Invalid buyer ETH balance after market order filled")

        // veify seller ETH balance
        let sellerEthBalanceAfter = (await dex.getEthBalance()).toNumber()
        let expectedSellerEthBalance = sellerEthBalanceBefore + (sellAmount * price) // order fully filled
        assert.equal(sellerEthBalanceAfter, expectedSellerEthBalance, "Invalid seller ETH balance after market order filled")
    })


    it("A SELL market order increases the filled amount of the matching BUY order by its filled amount", async () => { 
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let sellAmount = 20; let buyAmount = 100 
        let price = 20  // wei per 1 link

        // add BUY limit order to the orderbook by accounts[1]
        let depositedEth = buyAmount * price
        await dex.depositEth({value: depositedEth, from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyAmount, price, {from: accounts[1]})

        // create SELL market order by accounts[0]
        let depositAmount = sellAmount * price
        await link.approve(dex.address, depositAmount)
        await dex.deposit(depositAmount, ticker)
        await dex.createMarketOrder(Side.SELL, ticker, sellAmount)

        // verify the SELL market order is fully filled
        let orders = await dex.getOrders(ticker)
        assert.equal(orders.length, 1, "Expecting 1 order but "+orders.length+" were found")

        let sellOrder = orders[0]
        assert.equal(sellOrder.amount, sellAmount, "Invalid SELL order amount")
        assert.equal(sellOrder.amountFilled, sellOrder.amount, "Invalid SELL order filled amount")

        // veify BUY limit order was partially filled 
        let buyOrders = await dex.getOrderBook(ticker, Side.BUY)
        let buyOrder = buyOrders[0]
        assert.equal(buyOrders.length, 1, "Expecting 1 buy order but "+sellOrder.length+" were found")

        assert.equal(buyOrder.amount, buyAmount, "Invalid BUY order amount")
        assert.equal(buyOrder.amountFilled, sellAmount, "Invalid BUY order filled amount")
    })


    it("A SELL market order causes the limit BUY orders that are fully filled to be removed from the orderbook", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let sellOrderAmount = 15; let buyOrderAmount = 10 
        let price = 20 

        // add 2 BUY limit orders to the orderbook by accounts[1]
        await link.approve(dex.address, sellOrderAmount * 2, {from: accounts[1]})
        await dex.depositEth({value: buyOrderAmount * price * 2, from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})

        // deposit tokens into accounts[0]
        await link.approve(dex.address, sellOrderAmount)
        await dex.deposit(sellOrderAmount, ticker)
        
        // create SELL market order by accounts[0]
        await dex.createMarketOrder(Side.SELL, ticker, sellOrderAmount)

        // verify 1st BUY order, that was fully filled, was removed from the orderbook 
        let orders = await dex.getOrderBook(ticker, Side.BUY)
        assert.equal(orders.length, 1, "Invalid number of BUY orders in orderbook")
    })


    it("When a SELL market order amount is greater than the total amount in the orderbook's BUY orders, the orderbook is emptied", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let sellOrderAmount = 30; let buyOrderAmount = 10 
        let price = 20 

        // add 2 BUY limit orders to the orderbook by accounts[1]
        await link.approve(dex.address, sellOrderAmount * 2, {from: accounts[1]})
        await dex.depositEth({value: buyOrderAmount * price * 2, from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})

        // deposit tokens into accounts[0]
        await link.approve(dex.address, sellOrderAmount)
        await dex.deposit(sellOrderAmount, ticker)
        
        // create SELL market order by accounts[0]
        await dex.createMarketOrder(Side.SELL, ticker, sellOrderAmount)

        // verity there are no orders in orderbook
        let orders = await dex.getOrderBook(ticker, Side.BUY)
        assert.equal(orders.length, 0, "Invalid number of BUY orders in orderbook")
    })


    it("SELL market orders should fill the remaining part of partially filled limit BUY orders", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let sellOrderAmount = 15; let buyOrderAmount = 20 
        let price = 20 

        // add 3 BUY limit orders to the orderbook by accounts[1]
        await dex.depositEth({value: buyOrderAmount * price * 3, from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})

        await link.approve(dex.address, sellOrderAmount * 3)
        await dex.deposit(sellOrderAmount * 3, ticker)
        
        // create 1st SELL market order by accounts[0]
        await dex.createMarketOrder(Side.SELL, ticker, sellOrderAmount)

        // veify 1st BUY order was partially filled 
        let orders = await dex.getOrderBook(ticker, Side.BUY)
        assert.equal(orders.length, 3, "Invalid number of BUY orders in orderbook")
        assert.equal(orders[orders.length-1].amountFilled, 15, "Invalid filled amount in 1st order")

        // create 2st SELL market order by accounts[0]
        await dex.createMarketOrder(Side.SELL, ticker, sellOrderAmount)

        // veify 2nd BUY order was partially filled 
        orders = await dex.getOrderBook(ticker, Side.BUY)
        assert.equal(orders.length, 2, "Invalid number of BUY orders in orderbook")
        assert.equal(orders[orders.length-1].amountFilled, 10, "Invalid filled amount in 1st order")

        // create 3st SELL market order by accounts[0]
        await dex.createMarketOrder(Side.SELL, ticker, sellOrderAmount)

        // veify 3nd BUY order was partially filled 
        orders = await dex.getOrderBook(ticker, Side.BUY)
        assert.equal(orders.length, 1, "Invalid number of BUY orders in orderbook")
        assert.equal(orders[orders.length-1].amountFilled, 5, "Invalid filled amount in 1st order")
    })


    it("Limit BUY orders that are completely filled should be moved to the order history", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let sellOrderAmount = 20; let buyOrderAmount = 15 
        let price = 20 

        // add 3 BUY limit orders to the orderbook by accounts[1]
        await dex.depositEth({value: buyOrderAmount * price * 3, from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})
        await dex.createLimitOrder(Side.BUY, ticker, buyOrderAmount, price, {from: accounts[1]})

        await link.approve(dex.address, sellOrderAmount * 3)
        await dex.deposit(sellOrderAmount * 3, ticker)

        // create 3st SELL market order by accounts[0]
        await dex.createMarketOrder(Side.SELL, ticker, sellOrderAmount)
        await dex.createMarketOrder(Side.SELL, ticker, sellOrderAmount)
        await dex.createMarketOrder(Side.SELL, ticker, sellOrderAmount)

        // veify BUY orderbook has 0 orders left
        let buyOrders = await dex.getOrderBook(ticker, Side.BUY)
        assert.equal(buyOrders.length, 0, "Invalid number of BUY orders in orderbook")

        // veify filled limit orders are available in order history for limit buyer
        let ordersAccount1 = await dex.getOrders(ticker, {from: accounts[1]} )
        assert.equal(ordersAccount1.length, 3, "Invalid number of limit orders in order history")
        assert.equal(ordersAccount1[0].amountFilled, ordersAccount1[0].amount, "Invalid amountFilled in limit order in order history")
        assert.equal(ordersAccount1[1].amountFilled, ordersAccount1[1].amount, "Invalid amountFilled in limit order in order history")
        assert.equal(ordersAccount1[2].amountFilled, ordersAccount1[1].amount, "Invalid amountFilled in limit order in order history")

        // veify market orders are available in order history for market seller
        let ordersAccount0 = await dex.getOrders(ticker)
        assert.equal(ordersAccount0.length, 3, "Invalid number of market orders in order history")
        assert.equal(ordersAccount0[0].amountFilled, 20, "Invalid filled amount in market order in order history")
        assert.equal(ordersAccount0[1].amountFilled, 20, "Invalid filled amount in market order in order history")
        assert.equal(ordersAccount0[2].amountFilled, 5, "Invalid filled amount in market order in order history")
    })

})