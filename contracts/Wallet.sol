// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../node_modules/@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../node_modules/@openzeppelin/contracts/access/Ownable.sol";

contract Wallet is Ownable {

    using SafeMath for uint256;

    struct Token {
        bytes32 ticker;
        address tokenAddress;
    }

    mapping(bytes32 => Token) public tokenMapping;
    bytes32[] public tokenList;
    

    mapping (address => mapping(bytes32 => uint256)) public balances;

    modifier tokenExists(bytes32 ticker) {
        require(tokenMapping[ticker].tokenAddress != address(0), "Token does not exist");
        _;
    }

    function addToken(bytes32 ticker, address tokenAddress) onlyOwner external {
        require(tokenMapping[ticker].tokenAddress == address(0), "Token already exists");

        tokenMapping[ticker] = Token(ticker, tokenAddress);
        tokenList.push(ticker);
    }

    function getTokenAddress(bytes32 ticker) tokenExists(ticker) external view returns (address) {
        return tokenMapping[ticker].tokenAddress;
    }

    function getTokenBalance(bytes32 ticker) tokenExists(ticker) external view returns (uint256) {
        return balances[msg.sender][ticker];
    }

    function getEthBalance() public view returns (uint){
        return balances[msg.sender][bytes32("ETH")];
    }

    function getAllowance(bytes32 ticker) tokenExists(ticker) external view returns (uint256) {
        uint256 allowance = IERC20(tokenMapping[ticker].tokenAddress).allowance(msg.sender, address(this));

        return allowance;
    }



    function deposit(uint256 amount, bytes32 ticker) tokenExists(ticker) external {
        require(IERC20(tokenMapping[ticker].tokenAddress).allowance(msg.sender, address(this)) >= amount, "Insufficient allowance");

         IERC20(tokenMapping[ticker].tokenAddress).transferFrom(msg.sender, address(this), amount);
         balances[msg.sender][ticker] = balances[msg.sender][ticker].add(amount);
    }

    function withdraw(uint256 amount, bytes32 ticker) tokenExists(ticker) external {
        require(balances[msg.sender][ticker] >= amount, "Insufficient token balance");

        balances[msg.sender][ticker] = balances[msg.sender][ticker].sub(amount);
        IERC20(tokenMapping[ticker].tokenAddress).transfer(msg.sender, amount);
    }

    function depositEth() public payable returns (uint256) {
        balances[msg.sender][bytes32("ETH")] = balances[msg.sender][bytes32("ETH")].add(msg.value);

        return balances[msg.sender][bytes32("ETH")];
    }

    function withdrawEth(uint256 amount) external {
        require(balances[msg.sender][bytes32("ETH")] >= amount, "Insufficient ETH balance");
        balances[msg.sender][bytes32("ETH")] = balances[msg.sender][bytes32("ETH")].sub(amount);
        payable(msg.sender).transfer(amount);
    }

    function _clearTokens() onlyOwner internal {
        for (uint i=0; i<tokenList.length; i++) {
            bytes32 token = tokenList[i];
            delete tokenMapping[token];
        }
        
        delete tokenList;
    }

}
