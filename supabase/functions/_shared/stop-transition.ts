// Pure operational planner. Database owns authentication, ordering, locking and commit.
// Coordinates and numbered order come from the published CMS map, never a second stop list.
const radians = (n: number) => n * Math.PI / 180;
function distanceMeters(a: number[], b: number[]) {
  const h = Math.sin(radians(b[1]-a[1])/2)**2 + Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(radians(b[0]-a[0])/2)**2;
  return 12742000*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function buildOperationalSequence(features: any[]) {
  const stops = features.filter(f=>f?.properties?.active!==false && f?.properties?.pointType==='stop' && f.geometry?.type==='Point');
  const unique = new Map();
  for(const s of stops) { const n=String(s.properties.stopNumber); if(unique.has(n))throw Error('Duplicate operational stop number'); unique.set(n,s); }
  return [...unique.values()].sort((a:any,b:any)=>Number(a.properties.stopNumber)-Number(b.properties.stopNumber));
}
function projection(point:number[], line:number[][], start=0, end=Infinity) {
  let length=0,best={distance:Infinity,along:0};
  for(let i=1;i<line.length;i++) {
    const a=line[i-1],b=line[i],segment=distanceMeters(a,b);
    if(segment>0 && length+segment>=start && length<=end) {
      const scale=Math.cos(radians(point[1])),dx=(b[0]-a[0])*scale,dy=b[1]-a[1];
      let t=((point[0]-a[0])*scale*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy);
      t=Math.max(Math.max(0,(start-length)/segment),Math.min(Math.min(1,(end-length)/segment),t));
      const q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],d=distanceMeters(point,q);
      if(d<best.distance)best={distance:d,along:length+segment*t};
    }
    length+=segment;
  }
  return {...best,length};
}
function routeModel(features:any[], stops:any[]) {
  const routes=features.filter(f=>f.properties?.active!==false&&f.properties?.objectType==='route'&&f.geometry?.type==='LineString');
  if(routes.length!==1)return null;
  const route=routes[0];
  const line=route.geometry.coordinates;
  if(!Array.isArray(line)||line.length<2)return null;
  const total=projection(stops[0].geometry.coordinates,line).length;
  const offsets:number[]=[];
  for(const stop of stops) {
    const p=projection(stop.geometry.coordinates,line,offsets.length?offsets[offsets.length-1]:0);
    if(p.distance>200)return null;
    offsets.push(p.along);
  }
  // Geometry must actually return to the origin; do not fabricate a closing road.
  if(distanceMeters(line[line.length-1],stops[0].geometry.coordinates)>200)return null;
  offsets.push(total);
  return {line,offsets};
}
export function planStopTransition(input:any) {
  const {gps,previousGps,mapVersion,existingState}=input;
  const features=mapVersion?.map_data?.features||[],stops=buildOperationalSequence(features);
  if(stops.length!==5||stops.some((s:any,i:number)=>String(s.properties.stopNumber)!==String(i+1)))throw Error('Published route requires exactly five numbered operational stops');
  const time=Date.parse(gps.source_recorded_at||gps.received_at),point=[gps.longitude,gps.latitude];
  const prior=existingState?.operational_state;
  const sameContext=prior?.mapVersion===mapVersion.id && prior?.sourceRun===gps.tracking_source_run_id;
  const previous=sameContext?prior:null;
  const now=input.now??Date.now(),age=(now-time)/1000;
  if(!Number.isFinite(time)||age< -60||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90||
    (gps.accuracy_m!=null&&(!Number.isFinite(gps.accuracy_m)||gps.accuracy_m<0||gps.accuracy_m>50)))
    return {skipped:true,reason:'invalid',state:existingState,events:[]};
  if(previous&&time<=Date.parse(previous.timestamp))return {skipped:true,reason:'duplicate_or_older',state:existingState,events:[]};
  const previousTime=previousGps?Date.parse(previousGps.source_recorded_at||previousGps.received_at):NaN;
  if(previousGps && time>previousTime && (time-previousTime)<120000 &&
     Math.max(0,distanceMeters([previousGps.longitude,previousGps.latitude],point)-(gps.accuracy_m||0)-(previousGps.accuracy_m||0))/((time-previousTime)/1000)>50)
    return {skipped:true,reason:'jump',state:existingState,events:[]};
  const speed=typeof gps.speed_kmh==='number'&&Number.isFinite(gps.speed_kmh)&&gps.speed_kmh>=0?gps.speed_kmh:null;
  const stationary=speed!==null&&speed<=3;
  const positive=(value:any,fallback:number)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
  const cfg=input.config||{},delayed=positive(cfg.delayedSeconds,90),offline=Math.max(delayed,positive(cfg.offlineSeconds,300));
  const distances=stops.map((s:any)=>distanceMeters(point,s.geometry.coordinates));
  const radius=(i:number)=>positive(stops[i].properties.geofenceMetres,positive(cfg.arrivalMetres,200));
  let current=previous?.currentStop??null,next=previous?.nextStop??null,status='APPROACHING',outside=previous?.outside||0;
  let lastDeparted=previous?.lastDeparted??null,reset=false;
  // Bounded authoritative history of actual arrivals, never inferred skipped visits.
  let completed:number[]=(previous?.completedStops||[]).filter((n:any)=>Number.isInteger(n)&&n>=1&&n<=5);
  let originAway=previous?.originAway===true;
  let originInside=previous?.originInside||0;
  if(distances[0]>Math.max(radius(0)+50,positive(cfg.originRearmMetres,250)))originAway=true;
  originInside=previous?.currentStop===1 ? 0 : distances[0]<=radius(0) ? (previous && time-Date.parse(previous.timestamp)<=30000 ? Math.min(2,originInside+1) : 1) : 0;
  // A validated actual origin observation resets even an incomplete loop. Not a historic tour claim.
  // Ordered accepted observations describe route progress even when processing is delayed.
  // Wall-clock freshness only gates live health and ETA, not historical transitions.
  const origin=distances[0]<=radius(0)+1e-6;
  // Bootstrap is immediate. A return needs an outside observation and two ordered
  // accepted in-radius fixes. One jitter fix cannot clear completion history.
  if(origin && current!==1 && (!previous || (originAway && originInside>=2))) {
    current=1;next=2;outside=0;reset=true;completed=[];lastDeparted=null;originAway=false;originInside=0;
  }
  if(current!==null) {
    const exit=Math.max(radius(current-1)+20,Number(cfg.arrivalExitMetres)||130);
    outside=distances[current-1]>exit && !stationary && speed!==null?outside+1:0;
    if(outside>=2) {lastDeparted=current;next=(current%stops.length)+1;current=null;outside=0;status='DEPARTED';}
  }
  if(current===null) {
    // Bootstrap/recovery at a real stop, never pick the geographically closest NEXT stop.
    const relevant=next===null?distances.findIndex((d:number,i:number)=>d<=radius(i)):next-1;
    if(relevant>0&&distances[relevant]<=radius(relevant)+1e-6) {current=relevant+1;next=(current%stops.length)+1;outside=0;}
  }
  // A later numbered stop can recover a skipped segment, after two consistent
  // fixes. Never go backwards or fabricate completion of skipped stops.
  let skipCandidate:number|null=null,skipInside=0;
  if(next!==null && next>1 && (current===null || distances[current-1]>Math.max(radius(current-1)+20,Number(cfg.arrivalExitMetres)||130))) {
    // A reporting gap can hide departure. Two fixes at a distinct forward stop
    // prove displacement without inventing a departure timestamp.
    const candidate=distances.findIndex((d:number,i:number)=>(current===null?i+1>next:i+1>=next) && d<=radius(i));
    if(candidate>=0) {
      skipCandidate=candidate+1;
      skipInside=previous?.skipCandidate===skipCandidate && time-Date.parse(previous.timestamp)<=delayed*1000?(previous.skipInside||0)+1:1;
      if(skipInside>=2){if(current!==null)lastDeparted=current;current=skipCandidate;next=current%5+1;outside=0;skipCandidate=null;skipInside=0;}
    }
  }
  if(current!==null && !completed.includes(current))completed=[...completed,current];
  const route=routeModel(features,stops);
  if(next===null&&route) {
    let best=Infinity;
    for(let i=0;i<stops.length;i++){const p=projection(point,route.line,route.offsets[i],route.offsets[i+1]);if(p.distance<best){best=p.distance;next=((i+1)%stops.length)+1;}}
  }
  if(current!==null)status=stationary?'PARKED':'ARRIVING';
  const sample={at:time,speed};
  const samples=[...(previous?.samples||[]),sample].filter((s:any)=>s.at>=time-120000&&s.speed>=5&&s.speed<=80).slice(-24);
  const sorted=samples.map((s:any)=>s.speed).sort((a:number,b:number)=>a-b);
  const rolling=sorted.length>=4?sorted[Math.floor(sorted.length/2)]:Number(cfg.serviceSpeedKmh)||18;
  const pace=Math.max(8,Math.min(35,rolling));
  let remaining:number|null=null,eta:number|null=null;
  if(next!==null&&route) {
    const leg=(next+stops.length-2)%stops.length;
    const p=projection(point,route.line,route.offsets[leg],route.offsets[leg+1]);
    if(p.distance<=200){remaining=Math.max(0,route.offsets[leg+1]-p.along);if(current===null&&age<=delayed)eta=remaining/1000/pace*3600;}
  }
  // Filter only small speed noise. New leg/reset/gap adopts the new estimate immediately.
  if(eta!==null&&previous?.etaSeconds!=null&&previous.nextStop===next&&!reset&&time-Date.parse(previous.timestamp)<=120000)eta=.7*eta+.3*previous.etaSeconds;
  const operational={version:3,mapVersion:mapVersion.id,sourceRun:gps.tracking_source_run_id,timestamp:gps.source_recorded_at||gps.received_at,
    currentStop:current,nextStop:next,status,movement:stationary?'STATIONARY':speed===null?'UNKNOWN':'MOVING',outside,lastDeparted,
    completedStops:completed,originAway,originInside,skipCandidate,skipInside,stopOrder:stops.map((s:any)=>String(s.properties.stopNumber)),distanceToNextMetres:remaining,etaSeconds:eta,
    health:age>offline?'OFFLINE':age>delayed?'DELAYED':'LIVE',delayedSeconds:delayed,offlineSeconds:offline,samples,
    resetAt:reset?gps.source_recorded_at:previous?.resetAt||null};
  const detail=(n:number|null)=>n===null?null:stops[n-1];
  const active=detail(current),target=detail(next);
  const state={vehicle_id:gps.vehicle_id,project_id:gps.project_id,map_version_id:mapVersion.id,last_gps_history_id:gps.id,
    current_stop_id:active?.properties.objectId||null,current_stop_name:active?.properties.name||null,current_stop_number:current===null?null:String(current),
    expected_next_stop_id:target?.properties.objectId||null,expected_next_stop_number:next===null?null:String(next),sequence_index:next===null?null:next-1,
    last_completed_stop_id:detail(lastDeparted)?.properties.objectId||null,last_completed_stop_number:lastDeparted===null?null:String(lastDeparted),
    candidate_stop_id:null,candidate_stop_name:null,candidate_stop_number:null,candidate_started_at:null,candidate_gps_history_id:null,
    inside_streak:0,outside_streak:outside,arrival_event_id:null,entered_at:active?(previous?.currentStop===current?existingState?.entered_at:gps.source_recorded_at):null,
    operational_state:operational,updated_at:new Date(now).toISOString()};
  return {state,events:[],skipped:false};
}
