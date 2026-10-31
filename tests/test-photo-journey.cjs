/* Preserve the original configured red route independently of stop progress. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let styles=[],base=[];const stops=[1,2,3].map(n=>({id:'s'+n,completed:n<3,viewState:n<3?'completed':'upcoming'}));
const ctx={window:{},map:{},currentPublishedId:1,routeLengthKm:3,routeProperties:{directionMode:'twoway'},activeRouteFeature:{properties:{objectId:'route'}},sightseeingLayers:{eachLayer(fn){fn({feature:{properties:{objectType:'route',objectId:'route'}},setStyle:s=>base.push(s)})}},operationalLegs:[1,2].map(n=>({from:{locationKm:n-1,feature:{properties:{objectId:'s'+n}}},to:{locationKm:n,feature:{properties:{objectId:'s'+(n+1)}}}})),turf:{lineSliceAlong:()=>({})},L:{layerGroup:()=>({addTo(){return this},clearLayers(){styles=[]}}),geoJSON:(f,o)=>({addTo(){styles.push(o.style)}})}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('frontend/js/live-map/journey-route.js','utf8'),ctx);
ctx.window.journeyRoute.render({}, {routeProgressVerified:false,stops});
assert.equal(styles.length,0,'No yellow/green route overlays');assert.equal(base[0].opacity,.92,'Original configured route stays visible');
stops[1].completed=false;ctx.window.journeyRoute.render({}, {routeProgressVerified:true,stops});assert.equal(styles.length,0);assert(base.every(s=>s.opacity===.92));
console.log('PASS actual route renderer: original red route remains visible; progress does not repaint it yellow or green');
