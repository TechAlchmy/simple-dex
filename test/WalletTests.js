const Dex = artifacts.require("Dex")
const Link = artifacts.require("Link")

const truffleAssert = require("truffle-assertions")

contract("Wallet Tests", accounts => {
    
    it("should pass when the owner adds a token", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()
      
        // contract owner should be able to add token
        await truffleAssert.passes(
            // add token to wallet
             dex.addToken(web3.utils.fromUtf8("LINK"), link.address)
        )
    })

    it("should fail when a non-owner account adds a token", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        // contract owner should be able to add token
        await truffleAssert.reverts(
            // add token to wallet
             dex.addToken(web3.utils.fromUtf8("AAVE"), link.address, {from: accounts[1]})
        )
    })

    it("should handle deposits", async () => {
        let dex = await Dex.deployed()
        let link = await Link.deployed()

        await link.approve(dex.address, 500)
        await dex.deposit(100, web3.utils.fromUtf8("LINK"))

        let balance = await dex.balances(accounts[0], web3.utils.fromUtf8("LINK") )
        assert.equal(balance.toNumber(), 100, "Invalid balance")
    })

    it("should revert excessive widthrawals", async () => {
        let dex = await Dex.deployed()
        await truffleAssert.reverts(
            dex.withdraw(200, web3.utils.fromUtf8("LINK"))
        ) 
    })

    it("should handle widthrawals", async () => {
        let dex = await Dex.deployed()
        await truffleAssert.passes(
            dex.withdraw(100, web3.utils.fromUtf8("LINK"))
        ) 
    })

})