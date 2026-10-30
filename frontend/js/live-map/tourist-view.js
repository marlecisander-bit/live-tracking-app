/* Pure visual projection; source clocks, planner progress and ETA validity come from touristState. */
(function(root){
 function project(m){
  let label='',destination='',activity='',target=null;
  if(m.phase){
   if(m.phase==='PARKED'){label='PARKED AT';target=m.currentStop;activity=m.secondary;}
   else if(m.phase==='ARRIVING'){label='ARRIVING AT';target=m.nextConfirmedStop;}
   else if(m.phase==='LEAVING'){label='LEAVING';target=m.departureStop;activity=m.secondary;}
   else if(m.phase==='EN_ROUTE'){label='ON THE WAY TO';target=m.nextConfirmedStop;}
   else destination=m.message;
  }
  else if(m.gps==='unavailable'){destination='Location temporarily unavailable';}
  else if(['at_stop','parked'].includes(m.passengerState)&&m.currentConfirmed){label='CURRENT STOP';target=m.currentStop;activity=m.passengerState==='parked'?'Parked':'At stop';}
  else if(m.passengerState==='approaching'){label='ARRIVING AT';target=m.nextConfirmedStop;activity='Approaching';}
  else if(['moving','departing','stopped'].includes(m.passengerState)){label='NEXT STOP';target=m.nextConfirmedStop;activity=m.message;}
  else destination=m.message;
  destination=target?.name||destination||(label==='NEXT STOP'?'Next stop not confirmed':'Location not confirmed');
  const eta=m.etaKind ? m.etaText : m.etaConfidence==='valid'&&Number.isFinite(m.etaSeconds)?(m.etaSeconds<60?'ETA <1 min':'ETA '+Math.max(1,Math.round(m.etaSeconds/60))+' min'):'';
  const ordered=m.stopStatuses.slice().sort((a,b)=>Number(a.number)-Number(b.number));
  return {label,destination,activity,eta,presentationState:m.phase?m.passengerState:m.gps==='unavailable'?'unavailable':m.passengerState,targetId:target?.id||null,live:m.gps==='live'&&m.positionValid&&m.qualityAccepted&&m.evidenceLive!==false,
   stops:ordered.map(s=>({...s,viewState:!m.progressKnown?'unknown':s.current?'current':s.next?(m.passengerState==='approaching'?'approaching':'next'):s.completed?'completed':'upcoming'})),
   progressKnown:m.progressKnown,routeProgressVerified:m.gps==='live'&&m.coherent&&m.progressKnown&&m.phase!=='UNKNOWN'};
 }
 root.touristView={project};
})(typeof window!=='undefined'?window:globalThis);
