const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('frontend/js/live-map/format-display-values.js','utf8'),c);
const cases=[[18,{},'~18 min'],[21.5,{confidence:'MEDIUM'},'~22 min'],[null,{range:{min:18,max:25}},'~18\u201325 min'],[.9,{},'Arriving now'],[0,{},'Arriving now'],[18,{confidence:'LOW'},'ETA calculating\u2026'],[18,{atStop:true},'At Stop'],[null,{atStop:true},'At Stop'],[null,{range:{min:25,max:18}},'ETA calculating\u2026']];
for(const value of [undefined,null,NaN,Infinity,-Infinity,-1,'18','?', '\ufffd',{}])cases.push([value,{},'ETA calculating\u2026']);
for(const [value,options,expected] of cases){const actual=c.formatETA(value,options);assert.equal(actual,expected);assert.doesNotMatch(actual,/[?\ufffd]|undefined|null|NaN|Infinity/);}
for(const f of ['update-route-progress.js','stops-panel.js']){const s=fs.readFileSync('frontend/js/live-map/'+f,'utf8');assert.ok(!s.includes('etaMinutes*.85'));assert.ok(!s.includes('Updating ETA?'));}
console.log('PASS ETA formatter: single, explicit range, sub-minute, invalid/missing, LOW, at-stop and stationary at-stop; no malformed characters');
