# fhir-data
A Hyperledger Fabric typescript contract for eligibility checks based on FHIR-R4 resources

## Packaging the contract
Packaging the contract requires a peer node.  The instructions below package the fhir-data contract using the Hyperledger Fabric test-network.  For more details about using the Hyperledger Fabric test-network, see [Using the Fabric test network](https://hyperledger-fabric.readthedocs.io/en/release-2.3/test_network.html).

### Compile and package the contract
From your test-network directory, compile the contract to .js by running tsc with no args.  Then run the remaining commands to package the contract.  If you need to install tsc, you can use `npm install typescript`.
```shell
tsc
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
peer lifecycle chaincode package fhir-data@1.0.0.tar.gz --path <your-path>/connect-contracts/fabric/fhir-data/ --lang node --label fhir-data_1.0.0
```
