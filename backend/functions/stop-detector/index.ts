import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processProviderStops } from "./provider-handler.ts";
const jsonResponse=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
Deno.serve(async(req:Request)=>{
 const secret=Deno.env.get('TRACKING_PROCESSOR_SECRET')||'';
 if(req.method!=='POST'||secret.length<32||req.headers.get('x-tracking-secret')!==secret)return jsonResponse({error:'Unauthorized'},401);
 if(Deno.env.get('CENTRAL_PROCESSING_ENABLED')==='true')return jsonResponse({error:'Conflicting processor configuration'},503);
 try{
  const input=await req.json();
  if(typeof input.vehicle_id!=='string'||!input.vehicle_id)return jsonResponse({error:'Explicit vehicle_id required'},400);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  let query=db.from('vehicles').select('external_id,project_id').eq('external_id',input.vehicle_id);
  if(input.project_id)query=query.eq('project_id',input.project_id);
  const vehicle=await query.maybeSingle();if(vehicle.error||!vehicle.data)return jsonResponse({error:'Vehicle not found'},404);
  return jsonResponse(await processProviderStops(db,vehicle.data.external_id));
 }catch(error){console.error('Operational worker failed',error instanceof Error?error.message:'unknown');return jsonResponse({error:'Operational worker failed'},503);}
});
