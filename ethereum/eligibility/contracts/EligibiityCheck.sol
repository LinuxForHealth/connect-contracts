pragma solidity ^0.5.0;

contract EligibilityCheck {

    struct Coverage {
        string path;
        string data;
        string payor_ref;
        string subscriber_ref;
        uint coverage_start;
        uint coverage_end;
        bool is_valid;
    }

    mapping (string => string) patients;
    mapping (string => Coverage) coverages;
    mapping (string => string) organizations;
    
    event EligibilityResult(string path, bool result, string patient_ref, string insurer_ref, string coverage_ref);

   /* 
    * Add a Patient or Organization FHIR resource to the contract data.
    * 
    * fhir_type - string - FHIR type of the resource
    * path - string - FHIR path of the resource, e.g. /Patient/001
    * resource - string - the string representation of the FHIR resource
    */
    function add_fhir_resource(string memory fhir_type, string memory path, 
                               string memory resource) public returns (string memory) {
        
        if (compareStrings(fhir_type, 'Patient')) {
            patients[path] = resource;
            return "{'status': 'success'}";
        } else if (compareStrings(fhir_type, 'Organization')) {
            organizations[path] = resource;
            return "{'status': 'success'}";
        } else {
            return "{'status': 'failed - unsupported FHIR resource type'}";
        }
    }

   /* 
    * Add a Coverage FHIR resource to the contract data.
    *
    * This function requires that the Coverage resource be pre-parsed
    * at the client into payor_ref, subscriber_ref, coverage_start, 
    * and coverage_end parameters.
    *
    * path - string - FHIR path of the resource, e.g. /Coverage/001
    * resource - string - the string representation of the FHIR resource
    * payor_ref - string - coverage.payor[0].reference
    * subscriber_ref - string - coverage.subscriber.reference
    * coverage_start - uint - coverage.period.start converted to a timestamp
    * coverage_end - unit - coverage.period.end converted to a timestamp
    */
    function add_coverage_resource(string memory path, string memory resource, 
                                   string memory payor_ref, string memory subscriber_ref, 
                                   uint coverage_start, uint coverage_end) public returns (string memory) {
        
        Coverage memory coverage;
        coverage.data = resource;
        coverage.payor_ref = payor_ref;
        coverage.subscriber_ref = subscriber_ref;
        coverage.coverage_start = coverage_start;
        coverage.coverage_end = coverage_end;
        coverage.is_valid = true;

        coverages[path] = coverage;

        return "{'status': 'success'}";
    }

   /* 
    * From a CoverageEligibilityRequest FHIR resource, create an  
    * EligibilityResult event based on the available resource info 
    * in the stored contract data.
    *
    * This function requires that the CoverageEligibilityRequest resource
    * be pre-parsed at the client into insurer_ref, patient_ref, coverage_ref 
    * and coverage_date parameters.
    *
    * path - string - FHIR path of the resource, e.g. /Coverage/001
    * resource - string - the string representation of the FHIR resource
    * insurer_ref - string - CoverageEligibilityRequest insurer.reference
    * patient_ref - string - CoverageEligibilityRequest patient.reference
    * coverage_ref - string - CoverageEligibilityRequest insurance[0].coverage
    * coverage_date - unit - timestamp of the CoverageEligibilityRequest created
    */
    function check_eligibility(string memory path, string memory resource, 
                               string memory insurer_ref, string memory patient_ref, 
                               string memory coverage_ref, uint coverage_date) public returns (string memory) {
        bool result = false;
        string memory empty = "";

        if (compareStrings(patients[patient_ref], empty) || 
            compareStrings(organizations[insurer_ref], empty) || 
            !coverages[coverage_ref].is_valid) {
            emit EligibilityResult(path, result, patient_ref, insurer_ref, coverage_ref);
            return "{'status': 'failure - could not retrieve all references'}";
        }

        // At this point we've found the referenced objects; make sure they contain the correct results:
        // match the Coverage payor reference with the CoverageEligibilityRequest insurer.reference
        // match the Coverage subscriber patient reference with the CoverageEligibilityRequest patient.reference
        // match the Coverage period with the CoverageEligibilityRequest created date
        string memory coverage_payor_ref = coverages[coverage_ref].payor_ref;
        string memory coverage_subscriber_ref = coverages[coverage_ref].subscriber_ref;
        uint coverage_start = coverages[coverage_ref].coverage_start;
        uint coverage_end = coverages[coverage_ref].coverage_end;
        if (compareStrings(insurer_ref, coverage_payor_ref) &&
            compareStrings(patient_ref, coverage_subscriber_ref) &&
            coverage_date >= coverage_start && coverage_date <= coverage_end) {
            result = true;
        }

        emit EligibilityResult(path, result, patient_ref, insurer_ref, coverage_ref);
        return "{'status': 'success'}";
    }

   /* 
    * From https://ethereum.stackexchange.com/questions/30912/how-to-compare-strings-in-solidity/82739
    */
    function compareStrings(string memory a, string memory b) public pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}