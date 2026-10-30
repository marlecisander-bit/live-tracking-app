import {planStopTransition} from '../_shared/stop-transition.ts';
// Provider contract reused from the verified collector; payload is discarded after extraction.
export function normalize(text:string,uid:string,now=Date.now()){
 if(text.length>1000000)throw Error('PROVIDER_SIZE');let payload:any;
 try{payload=JSON.parse(text)}catch{const m=text.trim().match(/^collector\s*\(([\s\S]*)\)\s*;?$/);if(!m)throw Error('PROVIDER_FORMAT');payload=JSON.parse(m[1]);}
 const matches=Array.isArray(payload?.markers)?payload.markers.filter((m:any)=>String(m.uid)===uid):[];if(matches.length!==1)throw Error('PROVIDER_BINDING');
 const m=matches[0],n=(v:any)=>v==null||v===''?NaN:Number(v),raw=n(m.ora),time=raw>1e10?raw:raw*1000,latitude=n(m.lat),longitude=n(m.lng),speed_kmh=n(m.viteza),heading=n(m.directie);
 if(![time,latitude,longitude,speed_kmh,heading].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||speed_kmh<0||speed_kmh>250||heading<0||heading>360)throw Error('PROVIDER_FIX');
 if(time>now+60000||time<now-86400000)throw Error('PROVIDER_TIME');
 return {latitude,longitude,speed_kmh,heading,accuracy_m:null,source_recorded_at:new Date(time).toISOString()};
}
type Outcome={skipped:true;reason:string}|{skipped:false;payload:{gps:any;state:any;continuity:string}};
export function compute(c:any,fix:any,now=Date.now()):Outcome{
 const r=c.runtime,gps={...fix,id:Number(r.revision)+1,vehicle_id:c.vehicle.external_id,project_id:c.vehicle.project_id,tracking_source_run_id:r.source_run,received_at:new Date(now).toISOString()};
 // Never create a reset vote by re-receiving the same source timestamp.
 if(r.latest&&Date.parse(gps.source_recorded_at)<=Date.parse(r.latest.source_recorded_at))return {skipped:true,reason:'duplicate_or_older'};
 const prior=r.planner_state?.operational_state,same=prior?.mapVersion===c.mapVersion.id&&prior?.sourceRun===r.source_run;
 const result=planStopTransition({gps,previousGps:same?r.latest:null,mapVersion:c.mapVersion,existingState:r.planner_state,now});
 if(result.skipped)return {skipped:true,reason:result.reason||'invalid'};
 const op=result.state.operational_state,fresh=now-Date.parse(gps.source_recorded_at)<=90000;
 // Project loss is not a recovered empty completion list. Only a guarded fresh origin return
 // re-establishes a new journey here; any manual establishment needs separate trusted approval.
 const originEstablished=same&&fresh&&prior?.originAway===true&&prior?.originInside>=1&&op.currentStop===1&&op.resetAt!==prior?.resetAt;
 const continuity=same&&r.continuity==='known'||originEstablished?'known':'unknown';
 return {skipped:false,payload:{gps,state:result.state,continuity}};
}
