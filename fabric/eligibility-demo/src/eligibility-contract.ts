
import axios from 'axios';
import * as fs from 'fs';
import * as https from 'https';
import * as nats from 'nats';
import * as path from 'path';
import { Context, Contract } from 'fabric-contract-api';
import { R4 } from '@ahryman40k/ts-fhir-types';
import { either as E } from 'fp-ts';

export class EligibilityContract extends Contract {
    nats_client = null;
    nats_resends = 0;
    nats_server = null;
    fhir_server = null;
    agent = new https.Agent({  
        rejectUnauthorized: false
    });

    // Set the URLs of the external NATS and FHIR servers
    public async configureContract(ctx: Context, configStr: string) {
        const config: any = JSON.parse(configStr);
        this.nats_server = config.nats_server;
        this.fhir_server = config.fhir_server;
        console.info(`NATS server: ${this.nats_server}`);
        console.info(`FHIR server: ${this.fhir_server}`);
    }

    /*
     * Check eligibility using a FHIR CoverageEligibilityRequest and the FHIR server
     */
    public async checkEligibility(ctx: Context, resourceStr: string) {

        // determine the resource type and id
        const resource: any = JSON.parse(resourceStr);
        const resource_type: string = resource.resourceType;
        const resource_id: string = resource.id;
        let result: boolean = false;

        if (resource_type != 'CoverageEligibilityRequest') {
            console.error(`Error: unsupported resource type: ${resource_type}`);
            return;
        }

        console.info(`checkEligibility: received id: ${resource_id} resource type: ${resource_type} json: ${JSON.stringify(resource)}`);

        // validate the input resource
        this.validateResource(resource_type, resource);

        try {
            // check the references and the eligibility period
            const patient: any = await this.queryResourceByReference(ctx, resource.patient.reference);
            const insurer: any = await this.queryResourceByReference(ctx, resource.insurer.reference);
            const coverage: any = await this.queryResourceByReference(ctx, resource.insurance[0].coverage.reference);
            console.info(`Obtained patient: ${patient}, insurer: ${insurer} and coverage: ${coverage} objects`);

            // At this point we've found the referenced objects; make sure they contain the correct results:
            // match the Coverage payor reference with the CoverageEligibilityRequest insurer.reference
            // match the Coverage subscriber patient reference with the CoverageEligibilityRequest patient.reference
            // match the Coverage period with the CoverageEligibilityRequest created date
            console.info(`checkEligibility: payor refs: ${coverage.payor[0].reference} ${resource.insurer.reference}`);
            console.info(`checkEligibility: subscriber refs: ${coverage.subscriber.reference} ${resource.patient.reference}`);
            console.info(`checkEligibility: dates: ${resource.created} ${coverage.period.start} ${coverage.period.end}`);
            if (coverage.payor[0].reference == resource.insurer.reference &&
                coverage.subscriber.reference == resource.patient.reference &&
                this.dateInPeriod(resource.created, coverage.period.start, coverage.period.end)) {
                console.info('CoverageEligibilityResponse = true');
                result = true;
            } else {
                console.info('CoverageEligibilityResponse = false');
            }
        } catch (ex) {
            console.info(`Error checking eligibility, CoverageEligibilityResponse = false, exception = ${ex}`);
        }

        await this.sendCoverageEligibilityResponse(result, resource);
    }

    // GET resource from the FHIR server by reference
    private async queryResourceByReference(ctx: Context, ref: string): Promise<string> {

        const url: string = this.fhir_server + '/' + ref;
        const result = await this.queryResourceByURL(ctx, url);

        return result;
    }

    // GET resource from the FHIR server by url
    private async queryResourceByURL(ctx: Context, url: string): Promise<string> {

        var result: string = null;

        console.info(`queryResourceByURL: querying url: ${url}`);
        const options = { httpsAgent: this.agent };
        await axios.get(url, options)
            .then((response) => {
                console.info(`Result: ${response.data}`);
                console.info(`Status: ${response.status}`);
                console.info(`Headers: ${response.headers}`);
                console.info(`queryResourceByURL: resource received via url: ${url}`);
                result = response.data;
            })
            .catch((err) => {
                console.error(err);
            });

        return result;
    }

    /*
     * Validate an input FHIR resource & throw an exception if not valid.
     * 
     * Extend to support runtime validation for other FHIR types.
     */
    private validateResource(resource_type: string, resource: any) {
        let validation_result: any;

        switch(resource_type) {
            case 'Coverage':
                validation_result = R4.RTTI_Coverage.decode(resource);
                break;
            case 'CoverageEligibilityRequest':
                validation_result = R4.RTTI_CoverageEligibilityRequest.decode(resource);
                break;
            case 'CoverageEligibilityResponse':
                validation_result = R4.RTTI_CoverageEligibilityResponse.decode(resource);
                break;
            case 'Organization':
                validation_result = R4.RTTI_Organization.decode(resource);
                break;
            case 'Patient':
                validation_result = R4.RTTI_Patient.decode(resource);
                break;
            default:
                throw new Error(`FHIR validation error: unsupported resource type: ${resource_type}`);
        }

        if (E.isLeft(validation_result) ) {
            throw new Error(`FHIR validation error: ${JSON.stringify(validation_result.left)}`);
        } else {
            console.info(`validateResource: Successful validation: ${JSON.stringify(validation_result.right)}`);
        }
    }

    /*
     * Determine if a given date string is within a period identified by two date strings.
     */
    private dateInPeriod(request_date: string, start_date: string, end_date: string): boolean {
        // Expected date format "2014-08-16"
        let request = new Date(request_date).valueOf();
        let start = new Date(start_date).valueOf();
        let end = new Date(end_date).valueOf();
        console.info(`dateInPeriod: request= ${request} start=${start} end=${end}`);

        return (request >= start && request <= end) ? true : false;
    }

    /*
     * Create the CoverageEligibilityResponse and hand off to NATS.
     */
    async sendCoverageEligibilityResponse(result: boolean, request: any) {

        let disposition: string = (result) ? "Policy is currently in effect." : "Policy is not in effect.";
        let today: string = new Date().toISOString().slice(0,10);

        let message: any = {
            "resourceType": "CoverageEligibilityResponse",
            "id": request.id,
            "text": {
              "status": "generated",
              "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">A human-readable rendering of the CoverageEligibilityResponse.</div>"
            },
            "identifier": [
              {
                "system": "http://localhost:5000/fhir/coverageeligibilityresponse/"+request.id,
                "value": request.id
              }
            ],
            "status": "active",
            "purpose": [
              "validation"
            ],
            "patient": {
              "reference": request.patient.reference
            },
            "created": today,
            "request": {
              "reference": "http://www.BenefitsInc.com/fhir/coverageeligibilityrequest/"+request.id
            },
            "outcome": "complete",
            "disposition": disposition,
            "insurer": {
              "reference": request.insurer.reference
            },
            "insurance": [
              {
                "coverage": {
                  "reference": request.insurance[0].coverage.reference
                },
                "inforce": result
              }
            ]
        };

        this.validateResource('CoverageEligibilityResponse', message);
        console.info('Validated CoverageEligibilityResponse');

        await this.sendNATSMessage('EVENTS.coverageeligibilityresponse', message);
        console.info('Sent CoverageEligibilityResponse via NATS');
    }

    /*
     * Create the NATS client.
     */
    async createNATSClient(): Promise<nats.JetStreamClient> {
        const nkey = fs.readFileSync(path.resolve(__dirname, '../conf/nats-server.nk'));
        let server: string = this.nats_server;
        
        let nc = await nats.connect({
            servers: server,
            authenticator: nats.nkeyAuthenticator(new TextEncoder().encode(nkey.toString())),
            tls: {
                caFile: path.resolve(__dirname, '../conf/lfh-root-ca.pem'),
            }
        });
        console.log(`Connected to NATS server ${server}`);

        // create a jetstream client:
        const js = nc.jetstream();
        return js;
    }

    /*
     * Send a message to the configured NATS server.
     */
    async sendNATSMessage(subject: string, message: any) {
        if (!this.nats_client) {
            this.nats_client = await this.createNATSClient();
        }
        console.log('Publishing NATS message');
        try {
            const headers = nats.headers();
            headers.append("Nats-Msg-Id", message.id);
            let pa = await this.nats_client.publish(subject, new TextEncoder().encode(JSON.stringify(message)), { headers });
            const stream = pa.stream;
            const seq = pa.seq;
            const duplicate = pa.duplicate;
            console.log(`Published NATS message to subject: ${subject} stream: ${stream} seq: ${seq} duplicate: ${duplicate}`);
            this.nats_resends == 0;
        } catch (ex) {
            console.log(`Error publishing to JetStream stream: ${ex}`);
            console.log(typeof ex)
            if (ex == 'CONNECTION_CLOSED') {
                console.log(`Reconnecting to NATS and resending message`);
                this.nats_client = null;
                if (this.nats_resends == 0) {
                    // Reconnect and retry once
                    this.nats_resends++;
                    this.sendNATSMessage(subject, message);
                }
            }
        }
    }
}
