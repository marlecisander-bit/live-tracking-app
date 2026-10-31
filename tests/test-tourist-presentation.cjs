/* The real presenter and v1 bridges consume one immutable model; no network or DOM-text inference. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),nodes={},sent=[],handlers={};
function element(id){return nodes[id]??={textContent:'',hidden:false,dataset:{},children:[],addEventListener(){},classList:{toggle(){}},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},append(el){el.parent=this;this.children.push(el)},get firstElementChild(){return this.children[0]},insertBefore(el,before){this.children=this.children.filter(x=>x!==el);const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,el);el.parent=this},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)},querySelector(selector){return this.parts?.[selector]??(this.parts??={},this.parts[selector]=element('part-'+id+selector))}}}
let created=0;
const parent={postMessage:(data,origin)=>sent.push({data,origin})};
const window={appConfig:{allowedParentOrigins:['https://www.sightseeingshkodra.com']},parent,addEventListener:(n,f)=>handlers[n]=f};
const ctx={window,document:{getElementById:element,createElement:()=>element("created-"+(++created))},Intl,Date,URLSearchParams};vm.createContext(ctx);vm.runInContext(fs.readFileSync('frontend/js/live-map/tourist-view.js','utf8'),ctx);vm.runInContext(fs.readFileSync('frontend/js/live-map/public-presentation.js','utf8'),ctx);
const model={message:'At Rozafa Castle',passengerState:'at_stop',activityConfidence:'confirmed',positionFreshness:'live',progressKnown:true,completedStops:['3'],gps:'live',activity:'stopped',service:'unknown',etaConfidence:'unavailable',locationHistorical:false,positionValid:true,currentConfirmed:true,currentStop:{id:'s3',number:'3',name:'Rozafa Castle'},nextConfirmedStop:{id:'s4',number:'4',name:'Cathedral'},nextStop:{name:'Cathedral'},coherent:true,secondary:'Next stop · Cathedral',timing:'Live ETA unavailable',lastObservationAt:'2026-10-25T10:00:00Z',progressText:'2 of 5 stops observed',stopStatuses:[{id:'s3',number:'3',name:'Rozafa Castle',current:true,bridgeState:'current',label:'At Rozafa Castle',eta:''}]};
window.publicPresentation.render(model);assert.equal(element('van-movement-status').textContent,model.message);assert.equal(element('next-stop-name').textContent,model.secondary);assert.equal(element('van-message-label').textContent,'');
handlers.message({source:parent,origin:'https://evil.invalid',data:{type:'shkodra:request-status'}});assert.equal(sent.length,0);
handlers.message({source:{},origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:request-status'}});assert.equal(sent.length,0);
handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:request-status'}});assert.equal(sent[0].data.movement,model.message);
handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:request-journey',version:1}});assert.equal(sent.at(-1).data.stops[0].state,'current');
const stale={...model,gps:'unavailable',locationHistorical:true,currentConfirmed:false,message:'Live location temporarily unavailable',secondary:'Last seen at Rozafa Castle',stopStatuses:[{...model.stopStatuses[0],current:false,bridgeState:'upcoming',label:'Last seen at this stop'}]};
window.publicPresentation.render(stale);assert.equal(sent.at(-2).data.movement,stale.message);assert.equal(sent.at(-1).data.unavailable,true);assert.equal(sent.at(-1).data.stops[0].state,'upcoming');assert.equal(element('operational-live').hidden,true);assert.equal(element('van-message-label').textContent,'');
for(const msg of sent){assert.equal(msg.origin,'https://www.sightseeingshkodra.com');assert(!/latitude|longitude|source_run|speed_kmh/.test(JSON.stringify(msg.data)))}
console.log('PASS real presenter: card/bridge consistency, stale projection, exact parent/source allowlist and no coordinate payloads');
(async()=>{
 let fetches=0,readers=[];
 function adapter(origin){const w={location:{origin}};vm.runInNewContext(fs.readFileSync('frontend/js/live-map/tourist-schedule.js','utf8'),{window:w,URL,document:{hidden:false,addEventListener(){}},fetch:async()=>{fetches++;return {ok:true,json:async()=>({date:'2026-10-25',times:['09:00']})}},AbortSignal,Date,setInterval:f=>readers.push(f)});return w.touristSchedule}
 let remote=adapter('https://sightseeingshkodralivetrackingapp.netlify.app');await remote.refresh();assert.equal(fetches,0);assert.equal(remote.current,null);
 let same=adapter('https://www.sightseeingshkodra.com');await new Promise(r=>setImmediate(r));assert.equal(fetches,1);assert.equal(same.current.times[0],'09:00');assert(Number.isFinite(same.current.receivedAt));
 console.log('PASS schedule: CORS-dependent integration deferred without requests; same-origin read-only adapter accepts authoritative response');
})().catch(e=>{console.error(e);process.exitCode=1});

// Actual RAM model, not a hand-written presenter model, must agree across card, list and bridge.
vm.runInContext(fs.readFileSync('frontend/js/live-map/tourist-state.js','utf8'),ctx);
const phaseSession=window.touristState.createSession(),epoch=Date.parse('2026-10-30T10:00:00Z');
const phaseStops=Array.from({length:5},(_,i)=>({id:'phase'+i,number:String(i+1),name:'Stop '+(i+1),coordinates:[i*.01,0]}));
let lastPhaseInput;
for(let n=0;n<4;n++){let at=new Date(epoch+n*10000).toISOString();lastPhaseInput={now:epoch+n*10000,vehicleId:'v',projectId:'p',mapVersion:1,stops:phaseStops,position:{latitude:0,longitude:.01,speed_kmh:0,accuracy_m:null,source_recorded_at:at,source_run_id:'r'},stopState:{entered_at:new Date(epoch).toISOString(),operational_state:{version:3,mapVersion:1,sourceRun:'r',timestamp:at,currentStop:2,nextStop:3,etaSeconds:480}}};phaseSession.resolve(lastPhaseInput);}
for(const age of [0,120000,181000]){const m=phaseSession.resolve({...lastPhaseInput,now:lastPhaseInput.now+age});window.publicPresentation.render(m);const bridge=sent.at(-1).data;assert.equal(bridge.movement,m.message);assert.equal(bridge.phase,m.phase);assert.equal(element('van-movement-status').textContent,m.message);assert.equal(element('journey-eta').textContent,m.etaText||m.etaStatusText||'');assert.equal(element('operational-live').hidden,!m.evidenceLive);assert.equal(bridge.stops[1].state,m.stopStatuses[1].bridgeState);if(age===120000){assert.equal(m.phase,'UNKNOWN');assert.equal(bridge.confidence.position,'delayed');assert(bridge.statusValidUntil);assert.equal(element('journey-context').textContent,'');}if(age===181000){assert.equal(bridge.unavailable,false);assert.equal(m.phase,'UNKNOWN');}}
console.log('PASS actual RAM model -> card/stop list/bridge, parked grace expiry and LIVE consistency');

const warm=window.touristState.createSession().resolve(lastPhaseInput);window.publicPresentation.render(warm);assert.equal(warm.phase,'UNKNOWN');assert.equal(element('journey-context').textContent,'');assert.equal(element('journey-destination').textContent,'At stop · Stop 2');assert.equal(element('journey-eta').textContent,'~8 min travel after departure');assert.equal(warm.etaSeconds,null);assert.equal(sent.at(-1).data.movement,warm.message);assert.equal(sent.at(-1).data.unavailable,false);assert.equal(sent.at(-1).data.confidence.position,'live');assert.equal(element('operational-live').hidden,true);console.log('PASS actual card retains fresh planned stop and conditional travel duration without claiming parking or arrival countdown');

// Opt-in mode cannot affect standalone/default or untrusted parents.
assert.equal(element('app').dataset.websiteStatus,undefined);
assert.equal(sent.at(-1).data.embeddedDisplay,undefined);
window.location={search:'?embed=1&websiteStatus=external-v1'};
window.dispatchEvent=()=>{};ctx.Event=class Event{};
vm.runInContext(fs.readFileSync('frontend/js/live-map/public-presentation.js','utf8'),ctx);
window.publicPresentation.render(warm);
const handshake={type:'shkodra:request-journey',version:1,embeddedDisplayVersion:1};
handlers.message({source:parent,origin:'https://evil.invalid',data:handshake});
handlers.message({source:{},origin:'https://www.sightseeingshkodra.com',data:handshake});
handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:{...handshake,version:2}});
assert.equal(element('app').dataset.websiteStatus,undefined);
handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:handshake});
assert.equal(element('app').dataset.websiteStatus,'external-v1');
for(const model of [warm,stale,...[0,120000,181000].map(age=>phaseSession.resolve({...lastPhaseInput,now:lastPhaseInput.now+age}))]){
 window.publicPresentation.render(model);
 const display=sent.at(-1).data.embeddedDisplay;
 assert.equal(display.version,1);assert.equal(display.destination,element('journey-destination').textContent);
 assert.equal(display.activity,element('journey-activity').textContent);assert.equal(display.eta,element('journey-eta').textContent);
 assert.equal(display.stops.length,model.stopStatuses.length);
 assert(!/latitude|longitude|source_run|speed_kmh/.test(JSON.stringify(display)));
}
console.log('PASS opt-in display v1, trusted parent handshake, exact shared projection and unchanged default');
// Even a copied opt-in URL must retain the card when opened as a top-level page.
window.parent=window;window.postMessage=(data,origin)=>sent.push({data,origin});delete element('app').dataset.websiteStatus;
vm.runInContext(fs.readFileSync('frontend/js/live-map/public-presentation.js','utf8'),ctx);
window.publicPresentation.render(warm);
handlers.message({source:window,origin:'https://www.sightseeingshkodra.com',data:handshake});
assert.equal(element('app').dataset.websiteStatus,undefined);assert.equal(sent.at(-1).data.embeddedDisplay,undefined);
console.log('PASS opt-in URL opened standalone never hides the internal card');

// Invalid handshakes cannot emit or extend presentation; reload starts unclaimed.
window.parent=parent;
for(const search of ['', '?embed=1', '?websiteStatus=external-v1', '?embed=0&websiteStatus=external-v1', '?embed=1&websiteStatus=external-v1']){
 window.location={search};delete element('app').dataset.websiteStatus;
 vm.runInContext(fs.readFileSync('frontend/js/live-map/public-presentation.js','utf8'),ctx);
 const before=sent.length;
 for(const data of [{...handshake,version:undefined},{...handshake,version:'1'},{...handshake,version:2},{...handshake,embeddedDisplayVersion:2},{...handshake,embeddedDisplayVersion:'1'}])handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data});
 for(const origin of ['null','https://www.sightseeingshkodra.com.evil.invalid','http://127.0.0.1:4200'])handlers.message({source:parent,origin,data:handshake});
 assert.equal(sent.length,before);assert.equal(element('app').dataset.websiteStatus,undefined);
 handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:handshake});
 assert.equal(element('app').dataset.websiteStatus,search==='?embed=1&websiteStatus=external-v1'?'external-v1':undefined);
 window.publicPresentation.render(warm); // Handshake before model readiness still sends on first render.
 assert.equal(!!sent.at(-1).data.embeddedDisplay,search==='?embed=1&websiteStatus=external-v1');
}
for(const origin of ['https://sightseeingshkodralivetrackingapp.netlify.app','http://127.0.0.1:4199','http://localhost:4199','http://127.0.0.1:4200']){
 const w={location:{origin,hash:''}};
 vm.runInNewContext(fs.readFileSync('frontend/js/shared/app-config.js','utf8'),{window:w,URLSearchParams});
 for(const expected of ['https://sightseeingshkodra.app','https://sightseeingshkodra.com','https://www.sightseeingshkodra.com'])assert(w.appConfig.allowedParentOrigins.includes(expected));
 assert.equal(w.appConfig.allowedParentOrigins.includes('http://localhost:3011'),origin.endsWith(':4199'));
 assert(!w.appConfig.allowedParentOrigins.includes('http://127.0.0.1:4200'));
}
console.log('PASS exact versions, query gates, readiness before model, reload reset and development-only loopback origins');
// Existing active-stop selection remains source/origin/version gated.
let selected=0;
ctx.stopRecords=[{feature:{properties:{objectId:'real-stop',active:true}},layer:{getLatLng:()=>[1,2],openPopup(){selected++}}}];ctx.map={panTo(){}};ctx.followVan=true;
for(const version of [undefined,'1',2])handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:select-stop',version,id:'real-stop'}});
handlers.message({source:{},origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:select-stop',version:1,id:'real-stop'}});
assert.equal(selected,0);assert.equal(ctx.followVan,true);
handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:select-stop',version:1,id:'real-stop'}});assert.equal(selected,1);assert.equal(ctx.followVan,false);
console.log('PASS stop-selection command version/source rejection and existing selection behavior');

ctx.stopRecords.push({feature:{properties:{objectId:'inactive',active:false}},layer:{openPopup(){throw Error('inactive selected')}}});
for(const id of [1,'missing','inactive']){ctx.followVan=true;handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:select-stop',version:1,id}});assert.equal(ctx.followVan,true);}
handlers.message({source:parent,origin:'https://evil.invalid',data:{type:'shkodra:select-stop',version:1,id:'real-stop'}});assert.equal(selected,1);
