/* The real presenter and v1 bridges consume one immutable model; no network or DOM-text inference. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),nodes={},sent=[],handlers={};
function element(id){return nodes[id]??={textContent:'',hidden:false,dataset:{},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]}}}
const parent={postMessage:(data,origin)=>sent.push({data,origin})};
const window={appConfig:{allowedParentOrigins:['https://www.sightseeingshkodra.com']},parent,addEventListener:(n,f)=>handlers[n]=f};
const ctx={window,document:{getElementById:element},Intl,Date};vm.createContext(ctx);vm.runInContext(fs.readFileSync('frontend/js/live-map/public-presentation.js','utf8'),ctx);
const model={message:'At Rozafa Castle',gps:'live',activity:'stopped',service:'unknown',etaConfidence:'unavailable',locationHistorical:false,positionValid:true,currentConfirmed:true,currentStop:{name:'Rozafa Castle'},nextStop:{name:'Cathedral'},coherent:true,secondary:'Next stop · Cathedral',timing:'Live ETA unavailable',lastObservationAt:'2026-10-25T10:00:00Z',progressText:'2 of 5 stops observed',stopStatuses:[{id:'s3',number:'3',name:'Rozafa Castle',current:true,bridgeState:'current',label:'At Rozafa Castle',eta:''}]};
window.publicPresentation.render(model);assert.equal(element('van-movement-status').textContent,model.message);assert.equal(element('next-stop-name').textContent,model.secondary);assert.equal(element('van-message-label').textContent,'');
handlers.message({source:parent,origin:'https://evil.invalid',data:{type:'shkodra:request-status'}});assert.equal(sent.length,0);
handlers.message({source:{},origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:request-status'}});assert.equal(sent.length,0);
handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:request-status'}});assert.equal(sent[0].data.movement,model.message);
handlers.message({source:parent,origin:'https://www.sightseeingshkodra.com',data:{type:'shkodra:request-journey'}});assert.equal(sent.at(-1).data.stops[0].state,'current');
const stale={...model,gps:'unavailable',locationHistorical:true,currentConfirmed:false,message:'Live location temporarily unavailable',secondary:'Last seen at Rozafa Castle',stopStatuses:[{...model.stopStatuses[0],current:false,bridgeState:'upcoming',label:'Last seen at this stop'}]};
window.publicPresentation.render(stale);assert.equal(sent.at(-2).data.movement,stale.message);assert.equal(sent.at(-1).data.unavailable,true);assert.equal(sent.at(-1).data.stops[0].state,'upcoming');assert.equal(element('operational-live').textContent,'Unavailable');assert.equal(element('van-message-label').textContent,'');
for(const msg of sent){assert.equal(msg.origin,'https://www.sightseeingshkodra.com');assert(!/latitude|longitude|source_run|speed_kmh/.test(JSON.stringify(msg.data)))}
console.log('PASS real presenter: card/bridge consistency, stale projection, exact parent/source allowlist and no coordinate payloads');
(async()=>{
 let fetches=0,readers=[];
 function adapter(origin){const w={location:{origin}};vm.runInNewContext(fs.readFileSync('frontend/js/live-map/tourist-schedule.js','utf8'),{window:w,URL,document:{hidden:false,addEventListener(){}},fetch:async()=>{fetches++;return {ok:true,json:async()=>({date:'2026-10-25',times:['09:00']})}},AbortSignal,Date,setInterval:f=>readers.push(f)});return w.touristSchedule}
 let remote=adapter('https://sightseeingshkodralivetrackingapp.netlify.app');await remote.refresh();assert.equal(fetches,0);assert.equal(remote.current,null);
 let same=adapter('https://www.sightseeingshkodra.com');await new Promise(r=>setImmediate(r));assert.equal(fetches,1);assert.equal(same.current.times[0],'09:00');assert(Number.isFinite(same.current.receivedAt));
 console.log('PASS schedule: CORS-dependent integration deferred without requests; same-origin read-only adapter accepts authoritative response');
})().catch(e=>{console.error(e);process.exitCode=1});
