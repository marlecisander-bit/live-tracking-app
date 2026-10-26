/* Read-only schedule adapter. Cross-origin integration is deferred until website CORS is authorized. */
(function(root){
    const endpoint=new URL('https://www.sightseeingshkodra.com/api/public/day-planner');
    let current=null,pending=false;
    async function refresh(){
        if(root.location.origin!==endpoint.origin||document.hidden||pending)return;
        pending=true;
        try{
            const response=await fetch(endpoint.href,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(5000)});
            if(!response.ok)throw Error('Schedule unavailable');
            const data=await response.json();
            current={date:data.date,times:data.times,receivedAt:Date.now()};
        }catch{current=null;}finally{pending=false;}
        if(typeof updateSmartRouteInformation==='function')updateSmartRouteInformation();
    }
    root.touristSchedule={get current(){return current;},refresh};
    // No speculative CORS request, proxy, persisted schedule or hard-coded timetable.
    if(root.location.origin===endpoint.origin){refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);}
})(window);
