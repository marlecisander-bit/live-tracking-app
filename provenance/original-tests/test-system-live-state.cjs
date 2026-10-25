const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{stripTypeScriptTypes}=require('node:module');
const plan=vm.runInNewContext('(function(){'+stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/stop-transition.ts','utf8').replace(/export /g,''))+';return planStopTransition;})()',{console,structuredClone});
const coords=[[19,42],[19.02,42],[19.02,42.02],[19,42.02],[18.98,42.01]];
const features=coords.map((c,i)=>({type:'Feature',geometry:{type:'Point',coordinates:c},properties:{pointType:'stop',stopNumber:String(i+1),objectId:'s'+(i+1),name:'Stop '+(i+1)}}));features.push({geometry:{type:'LineString',coordinates:[...coords,coords[0]]},properties:{objectType:'route'}});
const mapVersion={id:1,map_data:{features}},base=Date.now();let state=null,previousGps=null,t=0,id=0;const results=[];
function fix(n,speed=0,offset=0,step=300){t+=step;const c=coords[n-1],gps={id:++id,vehicle_id:'v',project_id:'p',tracking_source_run_id:1,longitude:c[0],latitude:c[1]+offset/111195,speed_kmh:speed,accuracy_m:5,source_recorded_at:new Date(base+t*1000).toISOString()};const r=plan({gps,previousGps,mapVersion,existingState:state,now:base+t*1000});assert.equal(r.skipped,false);state=r.state;previousGps=gps;return state.operational_state;}
function depart(n){fix(n,20,150,5);return fix(n,20,160,5);}
function check(name,fn){fn();results.push({name,status:'PASS'});}
check('1 full loop',()=>{for(const n of [1,2,3,4,5,1]){const s=fix(n);assert.equal(s.currentStop,n);assert.equal(s.nextStop,n%5+1);depart(n);}});
check('2 skipped loop',()=>{for(const n of [1,2,3,4,1]){const s=fix(n);assert.equal(s.nextStop,n%5+1);depart(n);}});
check('3 moving 100m entry',()=>{fix(1);depart(1);const s=fix(2,20,99);assert.equal(s.status,'ARRIVING');assert.equal(s.currentStop,2);});
check('4 parked',()=>assert.equal(fix(2).status,'PARKED'));
check('5 ten minutes fresh parked',()=>{for(let i=0;i<120;i++){const s=fix(2,0,0,5);assert.equal(s.status,'PARKED');assert.equal(s.health,'LIVE');}});
check('6 departure',()=>{const s=depart(2);assert.equal(s.status,'DEPARTED');assert.equal(s.currentStop,null);assert.equal(s.nextStop,3);});
check('7 skip 5 origin reset',()=>{fix(3);depart(3);fix(4);const s=fix(1,20);assert.equal(s.currentStop,1);assert.equal(s.nextStop,2);assert.equal(s.status,'ARRIVING');});
check('8 stationary outside stops',()=>{depart(1);const s=fix(1,0,500);assert.equal(s.currentStop,null);assert.equal(s.movement,'STATIONARY');assert.equal(s.health,'LIVE');});
check('9 parked 3 fresh',()=>{fix(2);depart(2);const s=fix(3);assert.equal(s.currentStop,3);assert.equal(s.health,'LIVE');});
check('10 timestamp health contract',()=>{assert.equal(state.operational_state.delayedSeconds,90);assert.equal(state.operational_state.offlineSeconds,300);});
check('11 hysteresis',()=>{for(const m of [99,101,110,99,125,101])assert.equal(fix(3,20,m,5).currentStop,3);});
check('12 duplicate no transition',()=>{const r=plan({gps:previousGps,previousGps,mapVersion,existingState:state,now:base+t*1000});assert.equal(r.reason,'duplicate_or_older');assert.equal(r.state,state);assert.equal(r.events.length,0);});
check('13 out of order',()=>{const r=plan({gps:{...previousGps,source_recorded_at:new Date(base).toISOString()},previousGps,mapVersion,existingState:state,now:base+t*1000});assert.equal(r.reason,'duplicate_or_older');});
check('14 repeated loops',()=>{depart(3);for(let loop=0;loop<3;loop++)for(const n of [1,2,3,4,5,1]){assert.equal(fix(n).nextStop,n%5+1);depart(n);}});
check('15 late-open persisted state',()=>{fix(1);depart(1);const s=fix(2);assert.equal(JSON.parse(JSON.stringify(s)).currentStop,2);assert.equal(s.nextStop,3);});
check('17 no synthetic time',()=>assert.equal(state.operational_state.timestamp,previousGps.source_recorded_at));
check('18 stop5 entry',()=>{depart(2);fix(3);depart(3);fix(4);depart(4);const s=fix(5,20,90);assert.equal(s.currentStop,5);assert.equal(s.nextStop,1);});
check('19 stop5 departure',()=>{const s=depart(5);assert.equal(s.nextStop,1);assert.ok(s.etaSeconds>0);});
check('20 origin moving reset',()=>{const s=fix(1,15,80);assert.equal(s.currentStop,1);assert.equal(s.nextStop,2);assert.equal(s.status,'ARRIVING');});
fs.writeFileSync('docs/release-evidence/system-engine-local.json',JSON.stringify({scope:'Pure planner only; UI, SQL and reconnect acceptance separate',results},null,2));console.log('PASS '+results.length+' pure planner scenarios');
