const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
(async()=>{
 let now=0,calls=0,fail=false;const listeners={};const client={async rpc(){calls++;if(fail)return {error:Error('offline')};return {data:{position:{source:'scorpiontrack'}}};}};
 const window={appConfig:{},addEventListener(){}};const document={addEventListener(n,f){listeners[n]=f;}};
 vm.runInNewContext(fs.readFileSync('frontend/js/shared/gps-source.js','utf8'),{window,document,WeakMap,Map,Promise,Date:{now:()=>now}});
 const read=()=>window.selectedTracking.read(client,'van');
 await Promise.all([read(),read(),read()]);assert.equal(calls,1);
 now=4800;await read();assert.equal(calls,1);
 now=5000;await read();assert.equal(calls,2);
 listeners.projectchange();await read();assert.equal(calls,3);
 now=10000;fail=true;await assert.rejects(read());fail=false;await read();assert.equal(calls,5);
 await window.selectedTracking.read(client,'another-van');assert.equal(calls,6);
 listeners.adminsessionended();await read();assert.equal(calls,7);
 console.log('PASS shared tracking: concurrent readers, expiry, project/session isolation, error recovery and vehicle isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
