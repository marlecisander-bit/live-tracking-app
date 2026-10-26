const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const window={};vm.runInNewContext(fs.readFileSync('frontend/js/live-map/tourist-state.js','utf8'),{window,Intl,Date});
const now=Date.parse('2026-10-25T10:00:00Z'),results=[];
const stops=[1,2,3,4,5].map(n=>({id:'s'+n,number:n,name:n===3?'Rozafa Castle':'Stop '+n}));
function input(){return {now,mapVersion:106,vehicleId:'v',projectId:'p',stops,quality:'GOOD',position:{latitude:42,longitude:19,speed_kmh:20,source_run_id:1,movement_state:'MOVING',source_recorded_at:new Date(now).toISOString()},stopState:{vehicle_id:'v',project_id:'p',operational_state:{version:3,mapVersion:106,sourceRun:1,timestamp:new Date(now).toISOString(),currentStop:null,nextStop:3,completedStops:[1,2],status:'APPROACHING',movement:'MOVING',etaSeconds:480}}};}
function run(name,modify,verify){const i=input();modify(i);const m=window.touristState.resolve(i);verify(m);results.push({name,result:'PASS',message:m.message,gps:m.gps,eta:m.etaConfidence});}
run('Live moving',()=>{},m=>{assert.equal(m.message,'LIVE · On the way to Rozafa Castle');assert.equal(m.etaConfidence,'valid');assert.equal(m.etaSeconds,480)});
run('RC1 approach, never substitute next stop',i=>{Object.assign(i.stopState.operational_state,{status:'ARRIVING',currentStop:3,nextStop:4,etaSeconds:null})},m=>{assert.equal(m.message,'Approaching Rozafa Castle');assert.equal(m.currentStop.number,'3');assert.equal(m.nextStop.number,'4')});
run('Recognized arrival without boarding/dwell proof',i=>{Object.assign(i.stopState.operational_state,{status:'PARKED',currentStop:3,nextStop:4,etaSeconds:null});i.position.speed_kmh=0},m=>{assert.equal(m.message,'At Rozafa Castle');assert(!m.message.includes('Parked'));assert.equal(m.etaConfidence,'unavailable')});
run('Sparse stationary fix is never live parking',i=>{Object.assign(i.stopState.operational_state,{status:'PARKED',currentStop:3,nextStop:4});i.position.speed_kmh=0;i.position.source_recorded_at=new Date(now-480000).toISOString()},m=>{assert.equal(m.gps,'unavailable');assert.equal(m.message,'Live location temporarily unavailable');assert.equal(m.secondary,'Last seen at Rozafa Castle')});
run('Delayed stop uses last seen',i=>{i.position.source_recorded_at=new Date(now-91000).toISOString();i.stopState.operational_state.currentStop=3},m=>{assert.equal(m.message,'Last seen at Rozafa Castle');assert.equal(m.gps,'delayed')});
run('Unavailable between stops never destination-as-arrival',i=>{i.position.source_recorded_at=new Date(now-301000).toISOString()},m=>{assert.equal(m.message,'Live location temporarily unavailable');assert.equal(m.secondary,'Last destination: Rozafa Castle');assert.equal(m.etaSeconds,null)});
run('Adequate stationary evidence',i=>{i.position.speed_kmh=0;i.position.movement_state='STATIONARY';i.stopState.operational_state.movement='STATIONARY'},m=>assert.equal(m.message,'Temporarily stopped'));
run('Unknown speed never stopped',i=>{i.position.speed_kmh=null;i.stopState.operational_state.movement='STATIONARY'},m=>assert.equal(m.activity,'unknown'));
run('Departure projected',i=>{Object.assign(i.stopState.operational_state,{status:'DEPARTED',lastDeparted:2})},m=>{assert.equal(m.message,'Departed Stop 2');assert.equal(m.stopStatuses[1].bridgeState,'departed')});
run('Fresh position with stale op ETA',i=>{i.stopState.operational_state.timestamp=new Date(now-91000).toISOString()},m=>{assert.equal(m.etaConfidence,'outdated');assert.equal(m.etaSeconds,null);assert(!m.currentConfirmed)});
run('Old same-run op even within freshness is suppressed',i=>{i.stopState.operational_state.timestamp=new Date(now-5000).toISOString()},m=>assert.equal(m.etaConfidence,'outdated'));
for(const field of ['sourceRun','mapVersion'])run('Mismatched '+field,i=>{i.stopState.operational_state[field]=999},m=>{assert.equal(m.etaSeconds,null);assert.equal(m.currentStop,null);assert.equal(m.completedStops.length,0)});
run('Wrong project',i=>{i.stopState.project_id='another'},m=>assert.equal(m.coherent,false));
run('Wrong destination in ETA row',i=>{i.eta={map_version_id:106,next_stop_number:4,calculated_at:new Date(now).toISOString(),eta_seconds:480}},m=>assert.equal(m.etaConfidence,'outdated'));
run('Low-confidence ETA',i=>{i.eta={map_version_id:106,next_stop_number:3,calculated_at:new Date(now).toISOString(),eta_seconds:480,confidence:'LOW'}},m=>assert.equal(m.etaSeconds,null));
run('Poor quality',i=>{i.quality='POOR'},m=>{assert.equal(m.gps,'unavailable');assert.equal(m.etaSeconds,null)});
run('Transport unavailable with fresh fix',i=>{i.unavailable=true},m=>assert.equal(m.gps,'unavailable'));
run('Future observation rejected',i=>{i.position.source_recorded_at=new Date(now+61000).toISOString()},m=>assert.equal(m.gps,'unavailable'));
run('Missing observation never receipt-time freshness',i=>{delete i.position.source_recorded_at;i.position.received_at=new Date(now).toISOString()},m=>assert.equal(m.gps,'unavailable'));
run('Before-service verified timetable',i=>{i.now=Date.parse('2026-10-25T07:59:00Z');i.schedule={date:'2026-10-25',times:['09:00','11:00'],receivedAt:i.now}},m=>{assert.equal(m.service,'scheduled');assert.equal(m.message,'Tours start at 09:00');assert.equal(m.timing,'Next scheduled departure · 09:00')});
run('After departures not final tour completion',i=>{i.now=Date.parse('2026-10-25T17:00:00Z');i.schedule={date:'2026-10-25',times:['09:00','15:00'],receivedAt:i.now}},m=>{assert.equal(m.serviceMessage,'No more scheduled departures today');assert(!m.message.includes('finished'))});
run('Unknown hours neutral',()=>{},m=>assert.equal(m.service,'unknown'));
run('Stale schedule rejected at local midnight',i=>{i.now=Date.parse('2026-10-25T23:00:00Z');i.schedule={date:'2026-10-25',times:['09:00'],receivedAt:i.now}},m=>assert.equal(m.service,'unknown'));
run('Expired schedule rejected',i=>{i.schedule={date:'2026-10-25',times:['09:00'],receivedAt:now-90001}},m=>assert.equal(m.service,'unknown'));
for(const [age,gps] of [[90,'live'],[91,'delayed'],[300,'delayed'],[301,'unavailable']])run('Freshness boundary '+age,i=>{i.now+=age*1000},m=>assert.equal(m.gps,gps));
run('Completion is retained during outage, not relabelled departure',i=>{i.now+=301000},m=>{assert.deepEqual(Array.from(m.completedStops),['1','2']);assert(!m.stopStatuses.some(s=>s.bridgeState==='departed'))});
// The pure model never changes operational transition evidence.
const frozen=input();const before=JSON.stringify(frozen);window.touristState.resolve(frozen);assert.equal(JSON.stringify(frozen),before);
const {session}=require('./fixture.cjs');
for(const [name,steps] of [ ['Skipped recovery',s=>{s.fix(1);s.depart(1);s.fix(3,0,0,300);s.fix(3)}],['Origin guarded reset',s=>{s.fix(3);s.depart(3);s.fix(1,0,0,300);s.fix(1)}] ]){
 const s=session();steps(s);const i=input();i.mapVersion=1;i.stopState=s.state;i.vehicleId='fixture-van';i.projectId='fixture-project';i.position={...i.position,source_run_id:1,source_recorded_at:s.gps.source_recorded_at,speed_kmh:0};i.now=Date.parse(s.gps.source_recorded_at);const m=window.touristState.resolve(i);assert.deepEqual(Array.from(m.completedStops),Array.from(s.state.operational_state.completedStops,String));results.push({name,result:'PASS'});
}
fs.mkdirSync('reports/phase1',{recursive:true});fs.writeFileSync('reports/phase1/state-tests.json',JSON.stringify({result:'PASS',results},null,2));console.log('PASS '+results.length+' tourist model scenarios plus immutable-input check');
