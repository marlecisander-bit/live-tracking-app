/* Actual route renderer: only confirmed dwell colors completed legs; no network. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let styles=[],base=[];const stops=[1,2,3].map(n=>({id:'s'+n,completed:n<3,viewState:n<3?'completed':'upcoming'}));
const ctx={window:{},map:{},currentPublishedId:1,routeLengthKm:3,routeProperties:{directionMode:'twoway'},activeRouteFeature:{properties:{objectId:'route'}},sightseeingLayers:{eachLayer(fn){fn({feature:{properties:{objectType:'route',objectId:'route'}},setStyle:s=>base.push(s)})}},operationalLegs:[1,2].map(n=>({from:{locationKm:n-1,feature:{properties:{objectId:'s'+n}}},to:{locationKm:n,feature:{properties:{objectId:'s'+(n+1)}}}})),turf:{lineSliceAlong:()=>({})},L:{layerGroup:()=>({addTo(){return this},clearLayers(){styles=[]}}),geoJSON:(f,o)=>({addTo(){styles.push(o.style)}})}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('frontend/js/live-map/journey-route.js','utf8'),ctx);
ctx.window.journeyRoute.render({}, {routeProgressVerified:false,stops});
assert.equal(styles[0].color,'#197b51');assert.equal(styles[0].dashArray,null);assert.equal(styles[1].color,'#e0ad00');assert.equal(styles[1].dashArray,'9 8');assert.equal(base[0].opacity,0);
stops[1].completed=false;ctx.window.journeyRoute.render({}, {routeProgressVerified:true,stops});assert(styles.every(s=>s.color==='#e0ad00'&&s.dashArray==='9 8'));
console.log('PASS actual route renderer: confirmed green segments survive freshness loss; unconfirmed/skipped legs yellow dashed; conflicting base stroke hidden');
