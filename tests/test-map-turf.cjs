const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),zlib=require('zlib');
const full=fs.readFileSync('tests/fixtures/turf-7.3.5.min.js','utf8'),small=fs.readFileSync('frontend/js/vendor/turf.min.js','utf8');
const a={};vm.runInNewContext(full,a);const b={window:{}};vm.runInNewContext(small,b);
const line=a.turf.lineString([[19.5,42],[19.52,42.04],[19.55,42.1]]),p=a.turf.point([19.53,42.05]);
for(const [name,args] of [['point',[[19.5,42]]],['lineString',[[[19.5,42],[19.6,42.1]]]],['distance',[[19.5,42],[19.6,42.1]]],['bearing',[[19.5,42],[19.6,42.1]]],['length',[line]],['along',[line,2]],['lineSliceAlong',[line,1,3]],['nearestPointOnLine',[line,p]]]) assert.deepEqual(JSON.parse(JSON.stringify(b.window.turf[name](...args))),JSON.parse(JSON.stringify(a.turf[name](...args))),name);
console.log(JSON.stringify({functions:Object.keys(b.window.turf),fullBytes:full.length,selectedBytes:small.length,fullGzip:zlib.gzipSync(full).length,selectedGzip:zlib.gzipSync(small).length,equivalence:'8 representative geometry results match Turf 7.3.5'},null,2));
// Every runtime Turf reference must be supplied by the selected bundle.
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);}
for(const file of walk('frontend/js').filter(f=>f.endsWith('.js')&&!f.includes('/vendor/'))){for(const match of fs.readFileSync(file,'utf8').matchAll(/\bturf\.([A-Za-z]+)\s*\(/g))assert.equal(typeof b.window.turf[match[1]],'function',file+': '+match[1]);}
function clean(x){return JSON.parse(JSON.stringify(x));}
function geometryContext(turf){const ctx={turf,console};ctx.window=ctx;vm.createContext(ctx);for(const f of ['prepare-route-data','build-route-contexts'])vm.runInContext(fs.readFileSync('frontend/js/live-map/'+f+'.js','utf8'),ctx);return ctx;}
const published=require('./fixtures/published-map-106.json').map_data.features;
const fullContext=geometryContext(a.turf),smallContext=geometryContext(b.window.turf);
const stops=published.filter(f=>f.geometry?.type==='Point'&&f.properties.pointType==='stop').map(feature=>({id:feature.properties.objectId,feature}));
for(const ctx of [fullContext,smallContext]){ctx.stopRecords=clean(stops);ctx.stopById=Object.fromEntries(ctx.stopRecords.map(s=>[s.id,s]));ctx.buildAllRouteContexts(clean(published));}
assert(fullContext.routeContexts.length>0);assert.deepEqual(clean(smallContext.routeContexts),clean(fullContext.routeContexts),'actual route lengths, stop projections, repeated terminal stops, directions and legs');
let comparisons=0;
const lines=[a.turf.lineString([[0,0],[0,0],[0.01,0.01]]),a.turf.lineString([[179.9,10],[-179.9,10]]),...fullContext.routeContexts.map(c=>c.feature)];
for(const route of lines){const total=a.turf.length(route);for(let i=0;i<=20;i++){
 const km=total*i/20;const point=a.turf.along(route,km);const args=[route,point,{units:'kilometers'}];
 for(const api of [a.turf,b.window.turf])assert(Number.isFinite(api.nearestPointOnLine(...args).properties.location));
 for(const [name,args]of [['along',[route,km]],['nearestPointOnLine',[route,point]],['nearestPointOnLine',[route,a.turf.point([point.geometry.coordinates[0]+.01,point.geometry.coordinates[1]+.01])]],['lineSliceAlong',[route,Math.max(0,km-.01),Math.min(total,km+.01)]]]){assert.deepEqual(clean(b.window.turf[name](...args)),clean(a.turf[name](...args)),name+' route/endpoint/off-route/antimeridian');comparisons++;}
 }}
// Arrival estimates remain authoritative backend values, not new Turf-derived ETAs.
const arrival={window:{},findStopRecordByNumber:n=>stops.find(s=>String(s.feature.properties.stopNumber)===String(n))};vm.createContext(arrival);vm.runInContext(fs.readFileSync('frontend/js/live-map/calculate-arrivals.js','utf8'),arrival);
for(const confidence of ['valid','stale','invalid']){arrival.window.publicOperationalStatus={etaConfidence:confidence,nextStop:{number:'2'},etaSeconds:420,etaText:'7 min'};const result=arrival.calculateUpcomingArrivals();assert.equal(result.length,confidence==='valid'?1:0);if(result.length)assert.equal(result[0].etaMinutes,7);}
console.log('PASS selected Turf runtime inventory, actual published route contexts, '+comparisons+' vehicle/progress/edge geometry comparisons and authoritative arrival gating');
