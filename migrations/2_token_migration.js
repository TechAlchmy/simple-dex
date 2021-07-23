const Link = artifacts.require("Link");

module.exports = async function (deployer) {
  deployer.deploy(Link);
};
