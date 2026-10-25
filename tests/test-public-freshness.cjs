const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const status=fs.readFileSync('frontend/js/live-map/track-bus.js','utf8').split('function updateGPSStatus()')[1].split('setInterval(')[0];
let age=null,etaCleared=0,recovered=0;const badge={classList:{add(){},remove(){}}},text={innerText:''};
const ctx={window:{appConfig:{providerSelectionEnabled:true}},document:{getElementById:id=>id==='live-badge'?badge:text},getGPSAgeMs:()=>age,formatGPSAge:a=>Math.floor(a/1000)+'s',GPS_STALE_AFTER_MS:90000,setETAUnavailable(){etaCleared++;},vanPosition:{},activeRouteFeature:{},updateSmartRouteInformation(){recovered++;}};
vm.createContext(ctx);vm.runInContext('function updateGPSStatus()'+status,ctx);
for(const [input,label] of [[null,'WAITING'],[90001,'LIVE'],[180000,'LIVE'],[180001,'DELAYED'],[600001,'NO RECENT GPS'],[1000,'LIVE']]){age=input;ctx.updateGPSStatus();assert.ok(text.innerText.startsWith(label),text.innerText);}
assert.equal(etaCleared,2);assert.equal(recovered,3);
console.log('PASS actual public status function: missing/fresh/stale/offline/recovered; stale ETA suppressed');

