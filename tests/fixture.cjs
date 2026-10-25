const fs=require('fs'),vm=require('vm'),{stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('backend/functions/_shared/stop-transition.ts','utf8');
const plan=vm.runInNewContext('(function(){'+stripTypeScriptTypes(source.replace(/export /g,''))+';return planStopTransition;})()',{structuredClone});
const coords=[[19,42],[19.02,42],[19.02,42.02],[19,42.02],[18.98,42.01]];
function session({lag=0,config={},features}={}){
 features=features||coords.map((c,i)=>({type:'Feature',geometry:{type:'Point',coordinates:c},properties:{pointType:'stop',stopNumber:String(i+1),objectId:'s'+(i+1),name:'Stop '+(i+1)}})).concat([{geometry:{type:'LineString',coordinates:[...coords,coords[0]]},properties:{objectType:'route'}}]);
 const mapVersion={id:1,map_data:{features}};let state=null,previousGps=null,t=1700000000000,id=0;
 function fix(n,offset=0,speed=0,seconds=5){t+=seconds*1000;const gps={id:++id,vehicle_id:'fixture-van',project_id:'fixture-project',tracking_source_run_id:1,longitude:coords[n-1][0],latitude:coords[n-1][1]+offset/111195,speed_kmh:speed,source_recorded_at:new Date(t).toISOString()};const result=plan({gps,previousGps,mapVersion,existingState:state,config,now:t+lag});if(result.skipped)throw Error(result.reason);state=result.state;previousGps=gps;return state.operational_state;}
 function depart(n){fix(n,130,20);fix(n,260,20);return fix(n,270,20);}
 return {fix,depart,mapVersion,get state(){return state},get gps(){return previousGps},restore(s){state=JSON.parse(JSON.stringify(s))}};
}
module.exports={plan,session,coords};
