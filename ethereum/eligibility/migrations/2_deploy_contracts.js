var EligibilityCheck = artifacts.require("./EligibilityCheck.sol");

module.exports = function(deployer) {
  deployer.deploy(EligibilityCheck);
};
