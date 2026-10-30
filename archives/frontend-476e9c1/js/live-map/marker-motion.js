/* Visual only. Never writes a GPS point, route state or event. */
(function(root){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const metres=(a,b)=>{const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2),y=Math.sin((b.lng-a.lng)*r/2);return 12742000*Math.asin(Math.sqrt(Math.min(1,x*x+Math.cos(a.lat*r)*Math.cos(b.lat*r)*y*y)));};
 const angle=(a,b)=>(((b-a)%360+540)%360)-180;
 function qualityFilter(){let last=null,pending=null,context=null;return {check(p,key,now){
  if(key!==context){last=null;pending=null;context=key;}
  const time=Date.parse(p.source_recorded_at),point={lat:Number(p.latitude),lng:Number(p.longitude)};
  if(p.latitude==null||p.longitude==null||!Number.isFinite(time)||time>now+60000||!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||Math.abs(point.lat)>90||Math.abs(point.lng)>180)return 'REJECTED';
  if(last&&time<last.time)return 'REJECTED';
  if(last&&time===last.time)return metres(last.point,point)>1?'REJECTED':'ACCEPTABLE';
  const accuracy=p.accuracy_m==null?null:Number(p.accuracy_m);
  if(accuracy!==null&&(!Number.isFinite(accuracy)||accuracy<0||accuracy>150))return 'REJECTED';
  const d=last?metres(last.point,point):0,dt=last?(time-last.time)/1000:1;
  if(last&&(d/Math.max(1,dt)>40||d>1000)){
   if(!pending||time<=pending.time||metres(pending.point,point)>150){pending={time,point};return 'REJECTED';}
  }
  const headingConflict=last&&Number(p.speed_kmh)>15&&d>100&&Number.isFinite(last.heading)&&Number.isFinite(Number(p.bearing_deg))&&Math.abs(angle(last.heading,Number(p.bearing_deg)))>120;
  pending=null;last={time,point,heading:p.bearing_deg==null?null:Number(p.bearing_deg)};return accuracy>50||headingConflict?'POOR':accuracy===null?'ACCEPTABLE':'GOOD';
 },reset(){last=null;pending=null;}};}
 function create(options){
  let frame=null,display=null,last=null,heading=0,state=null;
  const raf=options.raf||root.requestAnimationFrame.bind(root),cancel=options.cancel||root.cancelAnimationFrame.bind(root);
  function stop(){if(frame!==null)cancel(frame);frame=null;}
  function render(p,h){display=p;heading=h;options.render(p,h);}
  return {stop,inspect:()=>state,update(p,route,now){
   const stamp=Date.parse(p.source_recorded_at),target={lat:p.latitude,lng:p.longitude};
   if(last&&stamp<=last.time)return;
   stop();const start=display||target,delta=last?stamp-last.time:0,d=metres(start,target);
   let from=null,to=null,path=null;
   try {if(route){from=route.project(start);to=route.project(target);if(from.distance<=60&&to.distance<=60&&(Math.abs(to.km-from.km)*1000)<=Math.max(150,d*3))path=route;}}catch{}
   const direction=from&&to&&to.km<from.km?-1:1;
   const speed=Math.max(0,Math.min(80,Number(p.speed_kmh)||0)),endHeading=speed>=3&&Number.isFinite(Number(p.bearing_deg))?heading+angle(heading,Number(p.bearing_deg)):heading;
   const duration=d>300?750:clamp(delta*.8,500,8000),startHeading=heading;
   const predictionSeconds=(options.predictionSeconds??10),maxPrediction=options.maxPredictionMetres??50;
   state={previousPosition:last?.point||null,targetPosition:target,previousTimestamp:last?.time||null,targetTimestamp:stamp,speed,heading:endHeading,predicted:false,routeAware:!!path};
   const first=!last;last={time:stamp,point:target};
   if(!first&&speed<3&&d<=Math.max(8,Math.min(30,Number(p.accuracy_m)||0))){render(start,heading);return;}
   if(first||options.reduced?.()||d>1000||(!path&&d>100)){render(target,endHeading);return;}
   function tick(){const at=options.now?options.now():Date.now(),elapsed=at-now,t=clamp(elapsed/duration,0,1);let point;
    if(path){let km=from.km+(to.km-from.km)*t;
     // Prediction is short, route-only, never crosses a known stop or outruns stale data.
     if(t===1&&speed>=3&&at-stamp<=predictionSeconds*1000&&p.movement_state==='MOVING'&&Math.abs(angle(endHeading,(path.bearing?.(to.km)??endHeading)+(direction<0?180:0)))<60){
      const extra=Math.min(maxPrediction,speed/3.6*Math.max(0,(at-now-duration)/1000),options.stopDistance?.()??0);km+=direction*extra/1000;state.predicted=extra>0;
     }
     point=path.at(km);
    }else point={lat:start.lat+(target.lat-start.lat)*t,lng:start.lng+(target.lng-start.lng)*t};
    render(point,startHeading+(endHeading-startHeading)*t);
    if(t<1||(path&&speed>=3&&at-stamp<predictionSeconds*1000))frame=raf(tick);else frame=null;
   }frame=raf(tick);
  }};
 }
 root.markerMotion={create,qualityFilter,metres,angle};
})(typeof window!=='undefined'?window:globalThis);
