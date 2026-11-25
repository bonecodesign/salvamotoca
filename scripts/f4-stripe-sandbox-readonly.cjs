/* Explicit operator invocation only. No credentials in argv, no file writes. */
"use strict";
const {runPreflight}=require("../f4-stripe-sandbox-readonly");
async function main(){
 if(process.argv.length!==3||process.argv[2]!=="--run-dedicated-sandbox-readonly"||process.env.GITHUB_ACTIONS==="true"||process.env.CI==="true")throw Error("Disabled");
 const input={mode:"sandbox_readonly",dedicatedProject:process.env.SM_STRIPE_PROJECT,ack:process.env.SM_STRIPE_READONLY_ACK,key:process.env.SM_STRIPE_RESTRICTED_TEST_KEY,accountId:process.env.SM_STRIPE_TEST_ACCOUNT,apiVersion:process.env.SM_STRIPE_API_VERSION};
 // Account-only CLI: no transaction reads. Exact payment bindings are reserved
 // for an internal caller backed by the accepted quote, never free-form CLI.
 const result=await runPreflight(input);
 process.stdout.write(JSON.stringify(result)+"\n");
}
main().catch(()=>{process.stderr.write("SM_STRIPE_READONLY=BLOCKED_OR_UNAVAILABLE\n");process.exitCode=1;});
