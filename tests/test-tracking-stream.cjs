const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
(async()=>{
 let now=0,calls=0,revision=1,onRow,onStatus,removed=0,fail=false;
 const listeners={};const document={addEventListener(n,f){listeners[n]=f;},dispatchEvent(){}};
 const window={appConfig:{selectedTrackingRealtimeEnabled:true},addEventListener(){}};
 const client={channel(){return {on(type,filter,cb){assert.equal(filter.table,'tracking_live_snapshots');onRow=cb;return this;},subscribe(cb){onStatus=cb;return this;}};},removeChannel(){removed++;},
 from(){return {select(){return this;},eq(){return this;},async maybeSingle(){calls++;return fail?{error:Error('offline')}:{data:{revision,snapshot:{position:{n:revision}}}};}};}};
 vm.runInNewContext(fs.readFileSync('frontend/js/shared/gps-source.js','utf8'),{window,document,CustomEvent:function(n,o){this.type=n;this.detail=o.detail;},Date:{now:()=>now}});
 const read=()=>window.selectedTracking.read(client,'van');
 await Promise.all([read(),read(),read()]);assert.equal(calls,1);
 onStatus('SUBSCRIBED');await read();assert.equal(calls,2);
 now=5000;await read();assert.equal(calls,2);
 onRow({new:{vehicle_id:'van',revision:3,snapshot:{position:{n:3}}}});assert.equal((await read()).position.n,3);
 onRow({new:{vehicle_id:'van',revision:2,snapshot:{position:{n:2}}}});assert.equal((await read()).position.n,3);
 now=60000;revision=3;await read();assert.equal(calls,3,'sanity read never postponed by messages');
 onStatus('CHANNEL_ERROR');now=65000;await read();assert.equal(calls,4);
 now=70000;await read();assert.equal(calls,4,"disconnected reads bounded to 15 seconds");
 now=80000;fail=true;await assert.rejects(read());fail=false;await read();assert.equal(calls,5,"backoff retains current state without another request");now=95000;await read();
 listeners.visibilitychange();assert.equal(removed,1);await read();assert.equal(calls,7,'resume fetches current authority');
 listeners.adminsessionended();assert.equal(removed,2);
 console.log('PASS stream: shared fetch, bounded sanity, stale event rejection, disconnect fallback, failed read recovery, visibility/session cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
