/* Pure presentation projection. No GPS processing, persistence, requests or journey mutation. */
(function (root) {
    const finite = n => typeof n === 'number' && Number.isFinite(n);
    const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
    function clock(now) {
        const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Tirane',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
        const part = key => parts.find(p => p.type === key).value;
        return {date:part('year')+'-'+part('month')+'-'+part('day'), time:part('hour')+':'+part('minute')};
    }
    function resolve(input) {
        const now = input.now ?? Date.now(), p = input.position, row = input.stopState;
        const raw = row?.operational_state, records = input.stops || [];
        const stops = records.filter(s => s.active !== false).map(s => ({id:String(s.id),number:String(s.number),name:String(s.name)}));
        const find = number => stops.find(s => s.number === String(number)) || null;
        const recorded = time(p?.source_recorded_at), age = (now-recorded)/1000;
        const coordinates = p && finite(p.latitude) && finite(p.longitude) && Math.abs(p.latitude)<=90 && Math.abs(p.longitude)<=180;
        const quality = !['POOR','REJECTED'].includes(input.quality) && p?.ui_observation_valid !== false &&
            (p?.accuracy_m == null || (finite(p.accuracy_m) && p.accuracy_m>=0 && p.accuracy_m<=50));
        const valid = coordinates && Number.isFinite(age) && age>=-60;
        const delayed = Number(input.config?.delayedSeconds)||90, offline = Math.max(delayed,Number(input.config?.offlineSeconds)||300);
        const gps = !valid || input.unavailable || !quality || age>offline ? 'unavailable' : age>delayed ? 'delayed' : 'live';
        const identity = !!raw && raw.version===3 && input.mapVersion!=null && String(raw.mapVersion)===String(input.mapVersion) &&
            p?.source_run_id!=null && String(raw.sourceRun)===String(p.source_run_id) &&
            (row.map_version_id==null || String(row.map_version_id)===String(input.mapVersion)) &&
            (!row.vehicle_id || !input.vehicleId || row.vehicle_id===input.vehicleId) &&
            (!p.vehicle_id || !input.vehicleId || p.vehicle_id===input.vehicleId) &&
            (!row.project_id || !input.projectId || row.project_id===input.projectId) &&
            (!p.project_id || !input.projectId || p.project_id===input.projectId);
        const op = identity ? raw : null, opTime = time(op?.timestamp), opAge=(now-opTime)/1000;
        // A newer position must not lend freshness to an older operational state/ETA.
        const coherent = !!op && Number.isFinite(opAge) && opAge>=-60 && opAge<=delayed && opTime===recorded;
        const current = op ? find(op.currentStop) : null, next = op ? find(op.nextStop) : null;
        const completed = op ? [...new Set((op.completedStops||[]).filter(n=>find(n)).map(String))] : [];
        const speed = finite(p?.speed_kmh) && p.speed_kmh>=0 ? p.speed_kmh : null;
        let activity='unknown', message='Live location temporarily unavailable';
        if (gps==='delayed') message=current?'Last seen at '+current.name:'Location update delayed';
        if (gps==='live' && coherent) {
            if (current && op.status==='PARKED') { activity='stopped'; message='At '+current.name; }
            else if (current && op.status==='ARRIVING') { activity='approaching'; message='Approaching '+current.name; }
            else if (current) { message='Near '+current.name; }
            else if (op.movement==='STATIONARY' && speed!==null && speed<=3 && p.movement_state==='STATIONARY') {
                activity='stopped'; message='Temporarily stopped';
            } else if (op.status==='DEPARTED' && find(op.lastDeparted) && speed>3) {
                activity='departed'; message='Departed '+find(op.lastDeparted).name;
            } else if (op.movement==='MOVING' && speed>3) {
                activity='moving'; message=next?'LIVE · On the way to '+next.name:'LIVE · On the way';
            }
        } else if (gps==='live') message='Updating route information';
        // Current production contract has no independent arrival/dwell confirmation.
        // ARRIVING means recognition within RC1's radius; PARKED alone never proves dwell.
        const e=input.eta;
        const etaIdentity = !e || (String(e.map_version_id)===String(op?.mapVersion) && String(e.next_stop_number)===String(next?.number) &&
            (!e.vehicle_id || !input.vehicleId || e.vehicle_id===input.vehicleId) &&
            (!e.project_id || !input.projectId || e.project_id===input.projectId) && time(e.calculated_at)===opTime &&
            (e.source_run_id==null || String(e.source_run_id)===String(op?.sourceRun)) &&
            finite(e.eta_seconds) && e.eta_seconds===op?.etaSeconds && (e.confidence==null || ['MEDIUM','HIGH'].includes(e.confidence)));
        const hasEta=finite(op?.etaSeconds) && op.etaSeconds>=0;
        const etaValid=gps==='live' && coherent && etaIdentity && next && !current && ['moving','departed'].includes(activity) && hasEta;
        const etaConfidence=etaValid?'valid':hasEta && (!coherent || gps!=='live' || !etaIdentity)?'outdated':'unavailable';
        const local=clock(now), schedule=input.schedule;
        const scheduleValid=schedule && schedule.date===local.date && finite(schedule.receivedAt) && now-schedule.receivedAt>=0 && now-schedule.receivedAt<=90000 &&
            Array.isArray(schedule.times) && schedule.times.every(t=>typeof t==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t));
        const times=scheduleValid?[...new Set(schedule.times)].sort():[];
        const departure=times.find(t=>t>=local.time)||null;
        let service='unknown', serviceMessage='';
        if (scheduleValid) {
            service='scheduled';
            serviceMessage=!times.length?'No scheduled tours today':local.time<times[0]?'Tours start at '+times[0]:!departure?'No more scheduled departures today':'';
            if (local.time<times[0] && !['moving','departed','approaching'].includes(activity)) message=serviceMessage;
        }
        // A departure timetable is not evidence a tour is operating or has finished.
        const etaText=etaValid?(op.etaSeconds<60?'Estimated arrival · less than 1 min':'Estimated arrival · ~'+Math.round(op.etaSeconds/60)+' min'):'';
        const timing=etaText || (departure?'Next scheduled departure · '+departure:'Live ETA unavailable');
        const observed=valid?new Date(recorded).toISOString():null;
        const secondary=gps!=='live'?(current?'Last seen at '+current.name:next?'Last destination: '+next.name:'Last confirmed location unavailable'):
            current&&next?'Next stop · '+next.name:next?'Next stop · '+next.name:'Route information updating';
        const model={service,serviceMessage,activity,gps,etaConfidence,currentStop:current,nextStop:next,completedStops:completed,
            coherent,positionValid:!!valid,qualityAccepted:quality,lastObservationAt:observed,ageSeconds:valid?Math.max(0,age):null,
            message,secondary,timing,etaText,etaSeconds:etaValid?op.etaSeconds:null,scheduledDeparture:departure,
            currentConfirmed:gps==='live'&&coherent&&!!current,locationHistorical:gps!=='live',
            stopStatuses:[],progressText:op?completed.length+' of '+stops.length+' stops observed':'Journey progress unavailable'};
        model.stopStatuses=stops.map(s=>{
            const at=model.currentConfirmed && s.number===current.number;
            const target=gps==='live'&&coherent&&s.number===next?.number;
            const seen=completed.includes(s.number);
            const departed=seen && op?.lastDeparted!=null && s.number===String(op.lastDeparted) && !at;
            let label=at?message:seen?'Previously seen at this stop':target?'Next stop':gps!=='live'?'Live arrivals unavailable':'Upcoming stop';
            if (!at && current && s.number===current.number && gps!=='live') label='Last seen at this stop';
            if (target && etaValid) label+=' · '+etaText;
            return {...s,current:at,next:!!target,completed:seen,label,bridgeState:departed?'departed':at?'current':target?'next':'upcoming',eta:target?etaText:''};
        });
        return model;
    }
    root.touristState={resolve,clock};
})(typeof window!=='undefined'?window:globalThis);
