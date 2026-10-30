/* One public confidence model. Observation windows live only in RAM; RC1 owns route progression. */
(function(root){
 const finite=n=>typeof n==='number'&&Number.isFinite(n), stamp=s=>typeof s==='string'?Date.parse(s):NaN;
 const rules=Object.freeze({radius:200,exit:220,leavingMetres:350,movingKmh:5,stoppedKmh:2,dwellSeconds:30,minDwellFixes:4,maxGapSeconds:45,
  directionSeconds:10,directionWindowSeconds:90,minDirectionFixes:3,directionMetres:20,stationarySpread:20,parkGraceSeconds:180,failedParkGraceSeconds:30,lastKnownSeconds:86400});
 const metres=(a,b)=>{const rad=n=>n*Math.PI/180,h=Math.sin(rad(b[1]-a[1])/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(rad(b[0]-a[0])/2)**2;return 12742000*Math.asin(Math.sqrt(Math.min(1,h)));};
    function clock(now) {
        const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Tirane',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
        const part = key => parts.find(p => p.type === key).value;
        return {date:part('year')+'-'+part('month')+'-'+part('day'), time:part('hour')+':'+part('minute')};
    }

 function context(i){return JSON.stringify([i.vehicleId,i.projectId,i.mapVersion,i.position?.source_run_id,!!i.stopState,i.stopState?.operational_state?.resetAt]);}
 function position(i){const p=i.position,t=stamp(p?.source_recorded_at),age=((i.now??Date.now())-t)/1000;
  const valid=!!p&&[p.latitude,p.longitude,t].every(finite)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180&&age>=-60&&
   (!p.vehicle_id||p.vehicle_id===i.vehicleId)&&(!p.project_id||p.project_id===i.projectId);
  const quality=valid&&!['POOR','REJECTED'].includes(i.quality)&&p.ui_observation_valid!==false&&(p.accuracy_m==null||finite(p.accuracy_m)&&p.accuracy_m>=0&&p.accuracy_m<=50);
  const op=i.stopState?.operational_state, row=i.stopState;
  const identity=!!op&&op.version===3&&String(op.mapVersion)===String(i.mapVersion)&&p?.source_run_id!=null&&String(op.sourceRun)===String(p.source_run_id)&&
   (!row.vehicle_id||row.vehicle_id===i.vehicleId)&&(!row.project_id||row.project_id===i.projectId)&&(row.map_version_id==null||String(row.map_version_id)===String(i.mapVersion));
  const delayed=Number(i.config?.delayedSeconds)||90;
  return {p,t,age,valid,quality,op:identity?op:null,coherent:identity&&stamp(op.timestamp)===t&&age<=delayed,delayed};
 }
 // This window classifies evidence for the presenter; it never chooses/advances an RC1 stop or calculates a moving ETA.
 function createSession(){let key=null,samples=[],visited=new Set(),park=null,approached=null,failureAt=null,lastAt=-Infinity,lastPhase='UNKNOWN',lastInput=null;
  function clear(){key=null;samples=[];visited.clear();park=null;approached=null;failureAt=null;lastAt=-Infinity;lastPhase='UNKNOWN';lastInput=null;}
  function resolveSession(i){const now=i.now??Date.now(),q=position(i),k=context(i),stops=i.stops||[];
   if(k!==key){clear();key=k;}
   if(q.quality&&q.t<lastAt&&lastInput)return resolveSession({...lastInput,now,unavailable:i.unavailable,quality:i.quality});
   if(!q.quality){samples=[];park=null;approached=null;}
   if(i.unavailable){if(failureAt===null)failureAt=now;}else failureAt=null;
   let ignored=false;
   if(q.quality&&q.t>lastAt&&q.age>=0&&q.age<=q.delayed&&!i.unavailable&&q.coherent){
    const p=q.p,point=[p.longitude,p.latitude],accuracy=p.accuracy_m??10,prior=samples.at(-1),dt=prior?(q.t-prior.at)/1000:0;
    const jump=prior&&dt>0&&dt<120&&Math.max(0,metres(prior.point,point)-accuracy-prior.accuracy)/dt>50;
    if(jump){ignored=true;}
    else {
     if(prior&&dt>rules.maxGapSeconds){samples=[];park=null;approached=null;lastPhase='UNKNOWN';}
     const along=finite(i.routePosition?.alongMetres)&&i.routePosition?.offRouteMetres<=150?i.routePosition.alongMetres:null;
     samples.push({at:q.t,point,speed:p.speed_kmh,accuracy,along});samples=samples.filter(s=>s.at>=q.t-180000).slice(-48);lastAt=q.t;lastInput={...i,position:{...i.position},stopState:{...i.stopState,operational_state:{...i.stopState.operational_state}}};
    }
   }else if(q.valid&&q.t<lastAt){ignored=true;}
   const op=q.op,find=n=>stops.find(s=>s.active!==false&&String(s.number)===String(n)),target=find(op?.currentStop??op?.nextStop);
   const stopDistance=(sample,s)=>Array.isArray(s?.coordinates)?metres(sample.point,s.coordinates):Infinity;
   let phase='UNKNOWN',stop=null;
   const recent=samples.filter(s=>s.at>=q.t-rules.directionWindowSeconds*1000),a=recent[0],b=recent.at(-1);
   let direction=0;
   if(a&&b&&recent.length>=rules.minDirectionFixes&&(b.at-a.at)/1000>=rules.directionSeconds&&recent.slice(-3).every(s=>finite(s.speed)&&s.speed>=rules.movingKmh)){
    const uncertainty=Math.max(rules.directionMetres,2*Math.max(...recent.map(s=>s.accuracy)));
    // Prefer the published route arc, so a curved approach can increase straight-line distance.
    if(a.along!==null&&b.along!==null&&finite(i.routePosition?.lengthMetres)){
     let delta=b.along-a.along,L=i.routePosition.lengthMetres;if(i.routePosition.wrap!==false&&delta< -L/2)delta+=L;delta*=i.routePosition.direction===-1?-1:1;
     const maxTravel=50*(b.at-a.at)/1000;
     if(delta>=uncertainty&&delta<=maxTravel)direction=1;else if(delta<=-uncertainty&&-delta<=maxTravel)direction=-1;
    }else if(target){const delta=stopDistance(a,target)-stopDistance(b,target);if(delta>=uncertainty)direction=1;else if(delta<=-uncertainty)direction=-1;}
   }
   if(q.coherent&&q.quality&&finite(q.p.speed_kmh)&&q.p.speed_kmh>=0&&q.p.speed_kmh<=250&&!i.unavailable&&!ignored&&target&&b&&b.at===q.t){
    const distance=stopDistance(b,target),inside=distance+b.accuracy<=rules.radius;
    let remaining=finite(target.alongMetres)&&b.along!==null?target.alongMetres-b.along:null;
    if(remaining!==null){if(i.routePosition.wrap!==false&&remaining< -i.routePosition.lengthMetres/2)remaining+=i.routePosition.lengthMetres;remaining*=i.routePosition.direction===-1?-1:1;}
    const pastTarget=remaining!==null&&remaining< -b.accuracy;
    const stationary=[];
    for(let n=samples.length-1;n>=0;n--){const s=samples[n];if(!finite(s.speed)||s.speed<0||s.speed>rules.stoppedKmh||s.accuracy>35||stopDistance(s,target)+s.accuracy>rules.radius)break;stationary.unshift(s);}
    const dwell=op.currentStop!=null&&!op.skipCandidate&&!op.outside&&stationary.length>=rules.minDwellFixes&&(b.at-stationary[0].at)/1000>=rules.dwellSeconds&&stationary.every(s=>metres(s.point,stationary[0].point)<=rules.stationarySpread);
    if(dwell){park={stop:target,at:q.t,point:stationary[0].point};visited.add(String(target.number));phase='PARKED';stop=target;}
    else if(park&&!op.outside&&String(op.currentStop)===String(park.stop.number)&&finite(q.p.speed_kmh)&&q.p.speed_kmh<rules.movingKmh&&metres(b.point,park.point)<=rules.stationarySpread&&stopDistance(b,park.stop)+b.accuracy<=rules.radius){if(q.p.speed_kmh<=rules.stoppedKmh)park.at=q.t;phase='PARKED';stop=park.stop;}
    else if(direction!==0&&q.p.speed_kmh>=rules.movingKmh){
     // Leaving needs a prior approach/confirmed visit, radial exit and several moving fixes.
     const departed=park?.stop||approached;
     const nearDeparture=departed&&stopDistance(b,departed)<=rules.leavingMetres+b.accuracy;
     if(departed&&!nearDeparture){park=null;approached=null;}
     const newTarget=departed&&String(target.number)!==String(departed.number)&&inside;
     if(departed&&nearDeparture&&!newTarget&&stopDistance(b,departed)>Math.max(40,2*b.accuracy)&&recent.slice(-3).every((s,n,tail)=>n===0||stopDistance(s,departed)>=stopDistance(tail[n-1],departed)-s.accuracy)&&stopDistance(b,departed)-stopDistance(recent.at(-3),departed)>=rules.directionMetres){phase='LEAVING';stop=departed;park=null;}
     else if(inside&&direction===1&&!pastTarget){phase='ARRIVING';stop=target;approached=target;park=null;}
     else if(direction===1&&op.currentStop==null){phase='EN_ROUTE';park=null;}
    }
    // Entry/exit hysteresis: hold an established approach through brief radial jitter, not speed reversal or stopping.
    if(phase==='UNKNOWN'&&lastPhase==='ARRIVING'&&!pastTarget&&approached&&direction>=0&&q.p.speed_kmh>=rules.movingKmh&&stopDistance(b,approached)<=rules.exit+b.accuracy){phase='ARRIVING';stop=approached;}
   }
   // Re-reading an unchanged fix does not extend either deadline, even if HTTP/Realtime is healthy.
   if(park&&phase==='UNKNOWN'&&stamp(op?.timestamp)===q.t&&!op?.outside&&String(op?.currentStop)===String(park.stop.number)&&q.valid&&q.quality&&!ignored&&q.t===lastAt&&finite(q.p.speed_kmh)&&q.p.speed_kmh>=0&&q.p.speed_kmh<=rules.stoppedKmh&&metres([q.p.longitude,q.p.latitude],park.point)<=rules.stationarySpread&&now-park.at<=rules.parkGraceSeconds*1000&&
     (failureAt===null||now-failureAt<=rules.failedParkGraceSeconds*1000)){phase='PARKED';stop=park.stop;}
   if(!q.quality||ignored||q.t!==lastAt){phase='UNKNOWN';stop=null;}
   lastPhase=phase;
   return resolve({...i,evidence:{phase,stopNumber:stop?.number,visited:[...visited],live:!i.unavailable&&q.age<=q.delayed&&phase!=='UNKNOWN',validUntil:phase==='PARKED'?Math.min(park.at+rules.parkGraceSeconds*1000,failureAt===null?Infinity:failureAt+rules.failedParkGraceSeconds*1000):q.t+q.delayed*1000,ignored}});
  }
  return {resolve:resolveSession,clear};
 }
 function resolve(i){const now=i.now??Date.now(),q=position(i),p=q.p,op=q.op,e=i.evidence||{},find=n=>(i.stops||[]).find(s=>s.active!==false&&String(s.number)===String(n));
  let phase=e.phase||'UNKNOWN';if(!q.quality||e.ignored||!op||op.skipCandidate!=null)phase='UNKNOWN';
  const offline=Math.max(q.delayed,Number(i.config?.offlineSeconds)||300),gps=!q.quality||i.unavailable||q.age>offline?'unavailable':q.age>q.delayed?'delayed':'live';
  if(phase!=='PARKED'&&(!q.coherent||gps!=='live'))phase='UNKNOWN';
  const stop=find(e.stopNumber),next=find(op?.nextStop);
  if(phase==='EN_ROUTE'&&!next||['ARRIVING','PARKED','LEAVING'].includes(phase)&&!stop)phase='UNKNOWN';
  const parked=phase==='PARKED'&&!!stop,arriving=phase==='ARRIVING'&&!!stop,leaving=phase==='LEAVING'&&!!stop;
  const moving=phase==='EN_ROUTE'||leaving,active=parked||arriving?stop:null;
  // Planned route context is a different fact from confirmed motion. Keep it available during warm-up/slow/off-route reporting.
  const planAvailable=!!(q.valid&&q.coherent&&next&&!i.unavailable&&op.skipCandidate==null);
  const offRoute=finite(i.routePosition?.offRouteMetres)&&i.routePosition.offRouteMetres>150;
  const statusDetail=q.quality&&q.age>q.delayed?'Last known location · waiting for a fresh GPS observation':offRoute?'Reported location is outside the tour route':phase!=='UNKNOWN'?'':i.unavailable?'Waiting for a location update':!op?'Journey progress not yet confirmed':!q.coherent?'Waiting for a current location update':!q.quality?'Location quality is insufficient for ETA':finite(p?.speed_kmh)&&p.speed_kmh<=2?'Confirming the stop':finite(p?.speed_kmh)&&p.speed_kmh<rules.movingKmh?'Low speed; confirming direction':'Confirming travel direction';
  const message=parked?'Parked at '+stop.name:arriving?'Arriving at '+stop.name:leaving?'Leaving '+stop.name:phase==='EN_ROUTE'&&next?'On the way to '+next.name:
   planAvailable?'Next planned stop · '+next.name:q.quality&&!i.unavailable&&q.age<=q.delayed?'Van location updated':'Location temporarily unavailable';
  const passengerState=parked?'parked':arriving?'approaching':leaving?'departing':phase==='EN_ROUTE'?'moving':'unavailable';
  const etaRow=i.eta,etaIdentity=!etaRow||(String(etaRow.map_version_id)===String(op?.mapVersion)&&String(etaRow.next_stop_number)===String(next?.number)&&stamp(etaRow.calculated_at)===q.t&&
   (!etaRow.vehicle_id||etaRow.vehicle_id===i.vehicleId)&&(!etaRow.project_id||etaRow.project_id===i.projectId)&&(etaRow.source_run_id==null||String(etaRow.source_run_id)===String(op?.sourceRun))&&
   etaRow.eta_seconds===op?.etaSeconds&&(etaRow.confidence==null||['MEDIUM','HIGH'].includes(etaRow.confidence)));
  const validTravel=q.coherent&&gps==='live'&&!offRoute&&etaIdentity&&next&&finite(op?.etaSeconds)&&op.etaSeconds>=0;
  const liveEta=validTravel&&moving&&(!op.currentStop||leaving),arrivingNow=arriving&&q.coherent&&gps==='live';
  // Optional departure is an explicitly verified visit-bound application contract, never a timetable or provider guess.
  const d=i.departure,departureAt=stamp(d?.at),knownDeparture=parked&&validTravel&&d?.verified===true&&d.vehicleId===i.vehicleId&&d.projectId===i.projectId&&
   String(d.mapVersion)===String(i.mapVersion)&&String(d.sourceRun)===String(p.source_run_id)&&String(d.stopNumber)===String(stop.number)&&d.visitStartedAt===i.stopState?.entered_at&&departureAt>=now;
  const contextTravel=phase==='UNKNOWN'&&planAvailable&&validTravel?op.etaSeconds:null;
  const duration=validTravel&&parked?op.etaSeconds:null,etaSeconds=arrivingNow?0:liveEta?op.etaSeconds:knownDeparture?(departureAt-now)/1000+duration:null;
  const mins=s=>s<60?'less than 1 min':'~'+Math.round(s/60)+' min';
  const etaText=arrivingNow?'Arriving now':liveEta?'Estimated arrival · '+mins(etaSeconds):knownDeparture?'Departure '+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Tirane',hour:'2-digit',minute:'2-digit'}).format(departureAt)+' · next arrival '+mins(etaSeconds):duration!==null?'Travel · '+mins(duration)+' after departure':contextTravel!==null?(op.currentStop!=null?'Travel · '+mins(contextTravel)+' after departure':'Route travel estimate · '+mins(contextTravel)):'';
  const etaConfidence=etaSeconds!==null?'valid':finite(op?.etaSeconds)&&!validTravel?'outdated':'unavailable';
  const local=clock(now),schedule=i.schedule;
  const scheduleValid=schedule?.verifiedForVehicle===true&&schedule.vehicleId===i.vehicleId&&schedule.date===local.date&&finite(schedule.receivedAt)&&now-schedule.receivedAt>=0&&now-schedule.receivedAt<=90000&&Array.isArray(schedule.times)&&schedule.times.every(t=>typeof t==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t));
  const times=scheduleValid?[...new Set(schedule.times)].sort():[],scheduledDeparture=times.find(t=>t>=local.time)||null;
  const completed=(e.visited||[]).filter(n=>find(n)).map(String),target=active||next,live=!!e.live&&phase!=='UNKNOWN'&&gps==='live';
  const model={phase,message,statusDetail,plannedNextStop:planAvailable?next:null,planAvailable,etaStatusText:etaText?'':'ETA unavailable',passengerState,activity:parked?'parked':arriving?'approaching':leaving?'departed':moving?'moving':'unknown',activityConfidence:phase==='UNKNOWN'?'unknown':live?'confirmed':'historical',
   gps,positionFreshness:gps,evidenceLive:live,statusValidUntil:phase==='UNKNOWN'?null:new Date(e.validUntil??(q.t+(parked?rules.parkGraceSeconds:q.delayed)*1000)).toISOString(),positionValid:q.valid,qualityAccepted:q.quality,coherent:q.coherent,parkingVerified:parked,markerVisible:q.quality&&q.age<=rules.lastKnownSeconds,
   markerTone:!live?'grey':parked?'blue':arriving?'amber':moving?'green':'grey',currentStop:active,departureStop:leaving?stop:null,currentConfirmed:parked,nextStop:next,nextConfirmedStop:phase==='UNKNOWN'?null:target,
   completedStops:completed,progressKnown:!!op,progressText:'Confirmed visits this session · '+completed.length+' of '+(i.stops||[]).length+' stops',
   etaConfidence,etaText,etaSeconds,etaKind:arrivingNow?'arriving':liveEta?'arrival':knownDeparture?'departure_and_arrival':duration!==null?'after_departure':contextTravel!==null?'travel_estimate':'unavailable',travelSeconds:duration??contextTravel,
   timing:etaText||(scheduledDeparture?'Scheduled departure · '+scheduledDeparture:''),secondary:parked&&next?'Next stop · '+next.name:leaving?'Next stop · '+(next?.name||'not confirmed'):'',
   lastObservationAt:q.valid?new Date(q.t).toISOString():null,ageSeconds:q.valid?Math.max(0,q.age):null,locationHistorical:!live,
   scheduledDeparture,service:scheduleValid?'scheduled':'unknown',serviceMessage:scheduleValid&&!times.length?'No scheduled tours today':scheduledDeparture?'Scheduled departure · '+scheduledDeparture:scheduleValid?'No more scheduled departures today':''};
  model.stopStatuses=(i.stops||[]).filter(s=>s.active!==false).map(s=>{const at=parked&&String(s.number)===String(stop.number),aim=phase!=='UNKNOWN'&&String(s.number)===String((parked?next:target)?.number),departed=leaving&&String(s.number)===String(stop.number),seen=completed.includes(String(s.number));
   const label=at?'Parked here':departed?'Leaving':aim?arriving?'Arriving now':parked?'Next stop':'On the way':planAvailable&&String(s.number)===String(next.number)?'Planned next stop':seen?'Visited (dwell confirmed)':'Tour stop';
   const timing=aim||contextTravel!==null&&planAvailable&&String(s.number)===String(next.number)?etaText:'';
   return {...s,id:String(s.id),number:String(s.number),current:at,next:aim&&!at,completed:seen,label:label+(timing&&timing!==label?' · '+timing:''),bridgeState:at?'current':departed&&seen?'departed':aim?'next':'upcoming',eta:timing};});
  return model;
 }
 root.touristState={resolve,createSession,clock,rules};
})(typeof window!=='undefined'?window:globalThis);
