const truffleAssert = require("truffle-assertions")
const Dex = artifacts.require("Dex")
const Link = artifacts.require("Link")

let Side = {
    BUY: 0,
    SELL: 1,
}

contract("Dex - Limit Orders Tests", accounts => {

    beforeEach(async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()
        let ticker = web3.utils.fromUtf8("LINK")
        await dex.clear()
        await dex.addToken(ticker, link.address)
        await link.transfer(accounts[1], 500)
    })


    it("revert a BUY order request when ETH balance is not sufficient", async () => {
        let dex = await Dex.deployed()
        await dex.depositEth({value: 100}) // web3.utils.toWei("100", "wei")}

        let ticker = web3.utils.fromUtf8("LINK")
        let amount = 100
        let price = 20   

        await truffleAssert.reverts(
            dex.createLimitOrder(Side.BUY, ticker, amount, price) 
        )
    })

   
    it("revert a SELL order request when the token balance is not sufficient", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let depositAmount = 20 
        let sellAmount = 100
        let price = 20 

        // await dex.addToken(ticker, link.address)
        await link.approve(dex.address, depositAmount)
        await dex.deposit(depositAmount, ticker)
        
        await truffleAssert.reverts(
            dex.createLimitOrder(Side.SELL, ticker, sellAmount, price)
        )
    })


    it("has BUY orderbook for a token ordered by ascending prices", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        await link.approve(dex.address, 1000)
        await dex.depositEth({value: 3000})

        let ticker = web3.utils.fromUtf8("LINK")
        let amount = 10
        await dex.createLimitOrder(Side.BUY, ticker, amount, 20) // eth = price * amount = 20 * 10 = 200
        await dex.createLimitOrder(Side.BUY, ticker, amount, 40)
        await dex.createLimitOrder(Side.BUY, ticker, amount, 50) 
        await dex.createLimitOrder(Side.BUY, ticker, amount, 15) 

        let orders = await dex.getOrderBook(ticker, Side.BUY)
        let orderPrices = orders.map(order => order.price)

        let expectedPrices = [15, 20, 40, 50]
        for(let i = 0; i < expectedPrices.length; i++) {
            assert.equal(orderPrices[i], expectedPrices[i], "Incorrect ordering of buy orders in orderbook")
        }
    })


    it("has SELL orderbook for a token ordered by descending prices", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")

        await link.approve(dex.address, 100)
        await dex.deposit(100, ticker)

        let amount = 10
        await dex.createLimitOrder(Side.SELL, ticker, amount, 20) 
        await dex.createLimitOrder(Side.SELL, ticker, amount, 40) 
        await dex.createLimitOrder(Side.SELL, ticker, amount, 10) 
        await dex.createLimitOrder(Side.SELL, ticker, amount, 15) 

        let orders = await dex.getOrderBook(ticker, Side.SELL)
        let orderPrices = orders.map(order => order.price)

        let expectedPrices = [40, 20, 15, 10]
        for(let i = 0; i < expectedPrices.length; i++) {
            assert.equal(orderPrices[i], expectedPrices[i], "Incorrect ordering of buy orders in orderbook")
        }
    })


    it("A BUY limit order transfers the amount of ETH rquired to execute the trade to the ETH reserved balance", async () => {
        let dex = await Dex.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let ethDeposited = 1000
        let buyAmount = 20;
        let price = 10 

        // add SELL limit order to the orderbook
        await dex.depositEth({value: ethDeposited})

        // verify initial ETH balance and reserved ETH balance
        let ethBalanceBefore = (await dex.getEthBalance()).toNumber()
        assert.equal(ethBalanceBefore, ethDeposited, "Invalid ETH amount")

        let reservedEthBalanceBefore = (await dex.getReservedEthBalance()).toNumber()
        assert.equal(reservedEthBalanceBefore, 0, "Invalid reserved ETH amount")

        // create limit BUY order
        await dex.createLimitOrder(Side.BUY, ticker, buyAmount, price)
     
        // verify ETH balance
        let ethBalanceAfter = (await dex.getEthBalance()).toNumber()
        let expetedEthAmount = ethBalanceBefore - (buyAmount * price)
        assert.equal(ethBalanceAfter, expetedEthAmount, "Invalid ETH amount")
        
        // verify reserved ETH balance
        let reservedEthBalanceAfter = (await dex.getReservedEthBalance()).toNumber()
        let expetedReservedEthAmount = buyAmount * price
        assert.equal(reservedEthBalanceAfter, expetedReservedEthAmount, "Invalid reserved ETH amount")
    })


    it("A SELL limit order transfers the amount of tokens rquired to execute the trade to the token reserved balance", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        let ticker = web3.utils.fromUtf8("LINK")
        let depositAmount = 100
        let sellAmount = 20;
        let price = 10 

        // add SELL limit order to the orderbook
        await link.approve(dex.address, depositAmount)
        await dex.deposit(depositAmount, ticker)

        // verify initial token balance and reserved token balance
        let tokenBalanceBefore = (await dex.getTokenBalance(ticker)).toNumber()
        assert.equal(tokenBalanceBefore, depositAmount, "Invalid token amount")

        let reservedTokenBalanceBefore = (await dex.getReservedTokenBalance(ticker)).toNumber()
        assert.equal(reservedTokenBalanceBefore, 0, "Invalid reserved token amount")

        // create limit SELL order
        await dex.createLimitOrder(Side.SELL, ticker, sellAmount, price)
     
        // verify token balance
        let tokenBalanceAfter = (await dex.getTokenBalance(ticker)).toNumber()
        let expetedTokenAmount = tokenBalanceBefore - sellAmount
        assert.equal(tokenBalanceAfter, expetedTokenAmount, "Invalid token amount")
        
        // verify reserved token balance
        let reservedTokenBalanceAfter = (await dex.getReservedTokenBalance(ticker)).toNumber()
        assert.equal(reservedTokenBalanceAfter, sellAmount, "Invalid reserved token amount")
    })

})