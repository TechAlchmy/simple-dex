# simple-dex
A simple Decentralised Exchange to trade ERC20 tokens for ETH.

My main motivation of this little project was to learn solidity, truffle and how to test smart contracts.

The DEX includes the following functionality:
- Add ERC20 tokens to the dex allow them to the traded.
- Deposit and widthraw ETH and ERC20 tokens to the dex. 
- Submit limit orders.
- Submit market orders.
- Execute trades when a market order is matched against existing limit orders.
- Supports partially filled limit and orders
- An order history that stores market and limit orders


The dex keeps a balance of available ETH and tokens that can be used to submit limtit orders.
When a user submits a limit ordeer, the amount of ETH or ERC20 tokens required to execute the trade is moved into a separate reserved balance.
Cancelling a limit order allows to recover the reserved ETH or ERC20 tokens into the regular account balance so they can be withdrawn.

There are a number of improvements that would be nice to make, for example:
- Automatically match new limit orders agaisnt existing limit orders in the orderbook.
- Cancel and update existing limit orders
