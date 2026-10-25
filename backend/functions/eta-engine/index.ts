// Retired endpoint. Keep authorization while cutover disables/removes the old schedule.
Deno.serve((req:Request)=>{
 const secret=Deno.env.get('TRACKING_PROCESSOR_SECRET')||'';
 if(req.method!=='POST'||secret.length<32||req.headers.get('x-tracking-secret')!==secret)return new Response('Unauthorized',{status:401});
 return new Response('Retired: operational state is produced by stop-detector',{status:410});
});
