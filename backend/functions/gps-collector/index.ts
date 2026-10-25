import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const number=(v:unknown)=>v===null||v===undefined||v===''?NaN:Number(v);
Deno.serve(async(req:Request)=>{
 const secret=Deno.env.get('TRACKING_PROCESSOR_SECRET')||'';
 if(req.method!=='POST'||secret.length<32||req.headers.get('x-tracking-secret')!==secret)return reply({error:'Unauthorized'},401);
 try{
  const body=await req.json();
  if(typeof body.binding_id!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.binding_id))return reply({error:'Explicit binding_id required'},400);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:binding,error}=await db.from('tracking_provider_bindings').select('*').eq('id',body.binding_id).eq('active',true).maybeSingle();
  if(error)return reply({error:'Provider configuration unavailable'},503);
  if(!binding)return reply({error:'Provider binding not found'},404);
  if(!/^SCORPION_TOKEN_[A-Z0-9_]+$/.test(binding.credential_env))return reply({error:'Invalid credential reference'},503);
  const token=Deno.env.get(binding.credential_env);
  if(!token)return reply({error:'Provider credential not configured'},503);
  const url=new URL('https://track.scorpiontrack.ro/TrackingTool/src/getPosition.ashx');
  url.searchParams.set('t',token);url.searchParams.set('format','json');url.searchParams.set('callback','collector');
  const response=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
  if(!response.ok)return reply({error:'Provider unavailable'},502);
  const text=await response.text();if(text.length>1000000)return reply({error:'Provider response too large'},502);
  let payload;try{payload=JSON.parse(text);}catch{
   const match=text.trim().match(/^collector\s*\(([\s\S]*)\)\s*;?$/);if(!match)return reply({error:'Invalid provider response'},502);payload=JSON.parse(match[1]);
  }
  const matches=Array.isArray(payload?.markers)?payload.markers.filter((m:any)=>String(m.uid)===binding.tracker_uid):[];
  if(matches.length!==1)return reply({error:'Configured tracker missing or ambiguous'},502);
  const m=matches[0],timestamp=number(m.ora),millis=timestamp>10000000000?timestamp:timestamp*1000;
  const latitude=number(m.lat),longitude=number(m.lng),speed=number(m.viteza),heading=number(m.directie);
  if(![millis,latitude,longitude,speed,heading].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||speed<0||speed>250||heading<0||heading>360)return reply({error:'Invalid provider fix'},502);
  if(millis>Date.now()+60000||millis<Date.now()-86400000)return reply({ok:true,stored:false,reason:'Provider timestamp outside accepted window'});
  const saved=await db.rpc('ingest_scorpion_point',{binding_id:binding.id,point:{tracker_uid:binding.tracker_uid,source_recorded_at:new Date(millis).toISOString(),latitude,longitude,speed_kmh:speed,heading}});
  if(saved.error)return reply({error:'Provider report rejected'},saved.error.code==='23505'?409:503);
  return reply(saved.data);
 }catch{return reply({error:'Provider collection failed'},502);}
});
