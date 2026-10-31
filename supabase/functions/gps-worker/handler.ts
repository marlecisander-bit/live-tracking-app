import {normalize,compute} from './engine.ts';
import {limitedText} from './limited.ts';
export function createHandler({env,fetcher=fetch,now=Date.now}:any){
 const response=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 return async(req:Request)=>{
 const expected=env('TRACKING_PROCESSOR_SECRET')||'',given=req.headers.get('x-tracking-secret')||'';
 let diff=expected.length^given.length;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^(given.charCodeAt(i)||0);
 if(req.method!=='POST'||expected.length<32||diff!==0)return response({error:'Unauthorized'},401);
 try{
 const text=await req.text();if(text.length>1024)return response({error:'Invalid request'},400);const body=JSON.parse(text);if(typeof body.vehicle_id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.vehicle_id))return response({error:'Explicit vehicle required'},400);
 const base=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');if(!base||!key)return response({error:'Backend unavailable'},503);
 const rpc=async(name:string,args:any)=>{const r=await fetcher(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(1000)});if(!r.ok)throw Error('RPC');return r.json();};
 const c=await rpc('tracking_claim',{target_vehicle:body.vehicle_id});if(!c)return response({ok:true,reason:'Busy or unconfigured'});
 if(c.serviceClosed===true)return response({ok:true,accepted:false,reason:'outside_operating_hours'});
 const closesAt=c.serviceClosesAt?Date.parse(c.serviceClosesAt):Infinity;
 if(now()>=closesAt)return response({ok:true,accepted:false,reason:'outside_operating_hours'});
 const ref=c.binding?.credential_env;if(!/^SCORPION_TOKEN_[A-Z0-9_]+$/.test(ref||''))throw Error('CONFIG');const token=env(ref);if(!token)throw Error('CONFIG');
 const url=new URL('https://track.scorpiontrack.ro/TrackingTool/src/getPosition.ashx');url.searchParams.set('t',token);url.searchParams.set('format','json');url.searchParams.set('callback','collector');
 const result=await fetcher(url.toString(),{signal:AbortSignal.timeout(Math.max(1,Math.min(2500,Math.floor(closesAt-now())))),headers:{accept:'application/json'}});if(!result.ok)throw Error('PROVIDER');const point=normalize(await limitedText(result),String(c.binding.tracker_uid),now()),planned=compute(c,point,now());
 if(planned.skipped===true)return response({ok:true,accepted:false,reason:planned.reason});
 const outcome=await rpc('tracking_commit',{target_vehicle:body.vehicle_id,expected_revision:c.runtime.revision,lease_token:c.lease,map_version:c.mapVersion.id,payload:planned.payload});
 if(outcome==='outside_operating_hours')return response({ok:true,accepted:false,reason:outcome});
 return response({ok:outcome==='committed',accepted:outcome==='committed',reason:outcome},outcome==='committed'?200:409);
 }catch{return response({error:'Tracking cycle unavailable'},503);}
 };
}
