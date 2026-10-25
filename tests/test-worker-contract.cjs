const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{stripTypeScriptTypes}=require('node:module');
(async()=>{let handler,calls=0;const env={TRACKING_PROCESSOR_SECRET:'synthetic-fixture-'.repeat(3),SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'};
const source=fs.readFileSync('backend/functions/stop-detector/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
vm.runInNewContext(stripTypeScriptTypes(source),{Request,Response,console:{error(){}},Deno:{env:{get:k=>env[k]},serve:f=>handler=f},createClient(){calls++;return {from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{external_id:'fixture-van'}}}}}}},processProviderStops:async()=>({ok:true,inputs:0})});
assert.equal((await handler(new Request('https://fixture.invalid',{method:'POST',body:'{}'}))).status,401);assert.equal(calls,0);
const req=body=>new Request('https://fixture.invalid',{method:'POST',headers:{'x-tracking-secret':env.TRACKING_PROCESSOR_SECRET},body:JSON.stringify(body)});
assert.equal((await handler(req({}))).status,400);env.CENTRAL_PROCESSING_ENABLED='true';assert.equal((await handler(req({vehicle_id:'fixture-van'}))).status,503);assert.equal(calls,0);env.CENTRAL_PROCESSING_ENABLED='false';assert.equal((await handler(req({vehicle_id:'fixture-van'}))).status,200);assert.equal(calls,1);console.log('PASS current worker authentication, explicit vehicle and conflicting-processor guards; zero network');
})().catch(e=>{console.error(e);process.exitCode=1});
