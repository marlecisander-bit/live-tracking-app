const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
(async()=>{
 let now=0,calls=0,revision=1,onRow,onStatus,removed=0,fail=false;
 const listeners={};const document={addEventListener(n,f){listeners[n]=f;},dispatchEvent(){}};
 const window={appConfig:{selectedTrackingRealtimeEnabled:true},addEventListener(){}};
 const client={channel(){return {on(type,filter,cb){assert.equal(filter.table,'tracking_live_snapshots');onRow=cb;return this;},subscribe(cb){onStatus=cb;return this;}};},removeChannel(){removed++;},
 from(){return {select(){return this;},eq(){return this;},async maybeSingle(){calls++;return fail?{error:Error('offline')}:{data:{revision,snapshot:{position:{n:revision,speed_kmh:0,source_recorded_at:'2026-10-31T10:00:00Z'}}}};}};}};
 vm.runInNewContext(fs.readFileSync(process.env.TRACKING_SOURCE||'frontend/js/shared/gps-source.js','utf8'),{window,document,CustomEvent:function(n,o){this.type=n;this.detail=o.detail;},Date:{now:()=>now}});
 const read=()=>window.selectedTracking.read(client,'van');
 await Promise.all([read(),read(),read()]);assert.equal(calls,1);
 onStatus('SUBSCRIBED');await read();assert.equal(calls,2);
 now=1000;await read();assert.equal(calls,2,'same cadence shares cached read');
 now=5000;const stopped=await read();assert.equal(stopped.position.speed_kmh,0);assert.equal(stopped.position.source_recorded_at,'2026-10-31T10:00:00Z');assert.equal(calls,3,'joined Realtime still checks latest snapshot every five seconds');
 const sourceAt='2026-10-31T10:00:00Z';
 onRow({new:{vehicle_id:'van',revision:3,snapshot:{position:{n:3,source_recorded_at:sourceAt}}}});assert.equal((await read()).position.n,3);assert.equal((await read()).position.source_recorded_at,sourceAt);
 onRow({new:{vehicle_id:'van',revision:2,snapshot:{position:{n:2}}}});assert.equal((await read()).position.n,3);
 now=10000;revision=3;await read();assert.equal(calls,4,'snapshot read is not postponed by Realtime messages');
 onStatus('CHANNEL_ERROR');now=15000;await read();assert.equal(calls,5);
 now=16000;await read();assert.equal(calls,5,'disconnected callers share the five-second read');
 now=20000;fail=true;await assert.rejects(read());fail=false;now=21000;await read();assert.equal(calls,6,'backoff retains current state without another request');now=25000;await read();assert.equal(calls,7,'failed read retries after five seconds');
 listeners.visibilitychange();assert.equal(removed,1);await read();assert.equal(calls,8,'resume fetches current authority');
 listeners.adminsessionended();assert.equal(removed,2);
 console.log('PASS stream: shared fetch, five-second current reads, stale event rejection, disconnect fallback, failed read recovery, visibility/session cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
