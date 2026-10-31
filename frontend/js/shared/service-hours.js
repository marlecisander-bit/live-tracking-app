(function(root){
 'use strict';
 const zone='Europe/Tirane',time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
 function valid(week){return Array.isArray(week)&&week.length===7&&week.every(d=>d===null||typeof d==='object'&&Object.keys(d).every(k=>k==='open'||k==='close')&&time.test(d.open)&&time.test(d.close)&&d.open!==d.close);}
 function evaluate(row,now=Date.now()){
  if(!row||!row.enabled)return {open:true,configured:false};
  if(row.time_zone!==zone||!valid(row.week))throw Error('Invalid operating hours');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday),clock=parts.hour+':'+parts.minute,d=row.week[day],prev=row.week[(day+6)%7];
  const open=!!(d&&(d.open<d.close?clock>=d.open&&clock<d.close:clock>=d.open)||prev&&prev.open>prev.close&&clock<prev.close);
  return {open,configured:true,message:open?'':d&&clock<d.open?'Service starts today at '+d.open:!d?'No service today':'Service finished for today',timeZone:zone};
 }
 const clients=new WeakMap();
 function entries(client){let e=clients.get(client);if(!e){e=new Map();clients.set(client,e);}return e;}
 async function read(client,vehicle){const all=entries(client);let e=all.get(vehicle);if(!e){e={at:-Infinity,row:null};all.set(vehicle,e);}if(e.pending)return e.pending;
  if(Date.now()-e.at<60000)return evaluate(e.row);
  e.pending=(async()=>{try{let query=client.from('vehicle_service_hours').select('vehicle_id,enabled,time_zone,week,updated_at').eq('vehicle_id',vehicle).maybeSingle();if(query.abortSignal&&typeof AbortSignal!=='undefined'&&AbortSignal.timeout)query=query.abortSignal(AbortSignal.timeout(10000));const result=await query;
   if(result.error){if(['42P01','PGRST205'].includes(result.error.code)&&!e.row?.enabled){e.row=null;}else throw result.error;}else e.row=result.data;
   const status=evaluate(e.row);e.at=Date.now();e.error=false;return status;
  }catch(error){e.error=true;throw error;}finally{e.pending=null;}})();return e.pending;
 }
 function current(client,vehicle){const e=clients.get(client)?.get(vehicle);const status=evaluate(e?.row);if(e?.error&&status.open)return {open:false,unavailable:true,message:'Service status temporarily unavailable'};return status;}
 function invalidate(client,vehicle){entries(client).delete(vehicle);}
 root.serviceHours={valid,evaluate,read,current,invalidate,zone};
})(typeof window==='undefined'?globalThis:window);
