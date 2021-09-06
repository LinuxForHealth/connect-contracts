# eligibility-demo
A Hyperledger Fabric typescript contract for eligibility checks based on FHIR-R4 resources retrieved from a FHIR R4 server.

## Packaging the contract
Packaging the contract requires a peer node.  The instructions below package the eligibility-demo contract using the Hyperledger Fabric test-network.  For more details about using the Hyperledger Fabric test-network, see [Using the Fabric test network](https://hyperledger-fabric.readthedocs.io/en/release-2.3/test_network.html).

### Compile and package the contract
Compile the contract to .js by running tsc with no args.  Then cd to the test-network directory to run the remaining commands to package the contract.
```shell
npm install -g typescript
cd <your-contract-path>/connect-contracts/fabric/eligibility-demo/
npm install
tsc
cd <your test-network-path>
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
peer lifecycle chaincode package eligibility@1.0.0.tar.gz --path <your-contract-path>/connect-contracts/fabric/fhir-data/ --lang node --label eligibility_1.0.0
```
