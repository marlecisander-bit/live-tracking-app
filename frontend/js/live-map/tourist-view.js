/* Pure visual projection; source clocks, planner progress and ETA validity come from touristState. */
(function(root){
 function project(m){
  let label='',destination='',activity='',target=null;
  if(m.gps==='unavailable'){destination='Live location temporarily unavailable';}
  else if(['at_stop','parked'].includes(m.passengerState)&&m.currentConfirmed){label='CURRENT STOP';target=m.currentStop;activity=m.passengerState==='parked'?'Parked':'At stop';}
  else if(m.passengerState==='approaching'){label='ARRIVING AT';target=m.nextConfirmedStop;activity='Approaching';}
  else if(['moving','departing','stopped'].includes(m.passengerState)){label='NEXT STOP';target=m.nextConfirmedStop;activity=m.passengerState==='departing'?'Departing':m.passengerState==='moving'?'On the way':'Temporarily stopped';}
  else if(m.passengerState==='last_seen'){label='LAST SEEN';target=m.message.startsWith('Last seen at ')?m.currentStop:null;destination=target?'':'Last known location';activity='Position not confirmed';}
  else if(m.gps==='live'){label='LIVE LOCATION';activity='Activity not confirmed';destination=m.message;}
  else destination='Live location temporarily unavailable';
  destination=target?.name||destination||(label==='NEXT STOP'?'Next stop not confirmed':'Location not confirmed');
  const eta=m.etaConfidence==='valid'&&Number.isFinite(m.etaSeconds)?(m.etaSeconds<60?'ETA <1 min':'ETA '+Math.max(1,Math.round(m.etaSeconds/60))+' min'):'';
  const ordered=m.stopStatuses.slice().sort((a,b)=>Number(a.number)-Number(b.number));
  return {label,destination,activity,eta,presentationState:m.gps==='unavailable'?'unavailable':m.passengerState,targetId:target?.id||null,live:m.gps==='live'&&m.positionValid&&m.qualityAccepted,
   stops:ordered.map(s=>({...s,viewState:!m.progressKnown?'unknown':s.current?'current':s.next?(m.passengerState==='approaching'?'approaching':'next'):s.completed?'completed':'upcoming'})),
   progressKnown:m.progressKnown,routeProgressVerified:m.gps==='live'&&m.coherent&&m.progressKnown};
 }
 root.touristView={project};
})(typeof window!=='undefined'?window:globalThis);
