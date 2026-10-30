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
        const positionIdentity=(!p?.vehicle_id||!input.vehicleId||p.vehicle_id===input.vehicleId)&&(!p?.project_id||!input.projectId||p.project_id===input.projectId);
        const valid = coordinates && positionIdentity && Number.isFinite(age) && age>=-60;
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
        let activity='unknown', passengerState='unavailable', activityConfidence='unknown', message='Live location temporarily unavailable';
        const skipPending=op?.skipCandidate!=null && Number(op.skipInside||0)<2;
        const associationValid=!skipPending&&Number(op?.outside||0)===0;
        const historicalStop=current && opTime===recorded && associationValid ? current : null;
        const departureStop=op ? find(op.lastDeparted) : null;
        const moving=speed>3 && p?.movement_state==='MOVING';
        const stationary=speed!==null && speed<=3 && p?.movement_state==='STATIONARY';
        const distance=coherent && finite(op?.distanceToNextMetres) && op.distanceToNextMetres>=0 ? op.distanceToNextMetres : null;
        // Dormant capability: the current production contract does not supply independent parking evidence.
        // A future trusted adapter must bind status measurement time, visit and identity, never receipt time.
        const parking=input.parkingEvidence, parkingTime=time(parking?.observedAt), parkingAge=(now-parkingTime)/1000;
        const parkingVerified=!!(input.capabilities?.independentParking===true && parking && historicalStop && quality && valid && !input.unavailable && age<=offline &&
            parking.source==='scorpiontrack' && parking.continuityVerified===true && parking.noMovementSinceVisit===true &&
            time(parking.stationarySince)>=time(row?.entered_at) && time(parking.stationarySince)<=recorded && parking.ignitionOff===true && parking.moving===false && parking.parked===true &&
            parking.vehicleId===input.vehicleId && parking.projectId===input.projectId && String(parking.mapVersion)===String(input.mapVersion) &&
            String(parking.sourceRun)===String(p.source_run_id) && String(parking.stopId)===current.id &&
            typeof row?.entered_at==='string' && parking.visitStartedAt===row.entered_at && parkingTime>=time(row.entered_at) &&
            parkingAge>=0 && parkingAge<=90 && !moving);
        if(parkingVerified){activity='parked';passengerState='parked';activityConfidence='confirmed';message='Parked at '+current.name;}
        else if(gps==='live') {
            if(coherent && current && associationValid && op.status==='PARKED' && stationary){activity='stopped';passengerState='at_stop';activityConfidence='confirmed';message='At '+current.name;}
            else if(coherent && current && associationValid && op.status==='ARRIVING' && moving){activity='approaching';passengerState='approaching';activityConfidence='confirmed';message='Approaching '+current.name;}
            else if(coherent&&current&&associationValid){passengerState='location';message='Near '+current.name;}
            else if(coherent && !current && op.status==='DEPARTED' && departureStop && moving){activity='departed';passengerState='departing';activityConfidence='confirmed';message='Departing '+departureStop.name;}
            else if(coherent && !skipPending && !current && next && moving && distance!==null && distance<=200){activity='approaching';passengerState='approaching';activityConfidence='confirmed';message='Approaching '+next.name;}
            else if(coherent&&current&&!associationValid&&!skipPending){passengerState='location';activityConfidence='inferred';message='Near '+current.name;}
            else if(moving){activity='moving';passengerState='moving';activityConfidence='confirmed';message=coherent&&!skipPending&&next?'On the way to '+next.name:'The van is on the way';}
            else if(stationary){activity='stopped';passengerState='stopped';activityConfidence='confirmed';message=coherent&&!skipPending&&!current?'Temporarily stopped between stops':'The van is temporarily stopped';}
            else {passengerState='location';message='Live van location';}
        } else if(valid && quality && !input.unavailable && age<=86400){
            passengerState='last_seen';activityConfidence='historical';message=historicalStop?'Last seen at '+historicalStop.name:'Last known van location';
        }
        const e=input.eta;
        const etaIdentity = !e || (String(e.map_version_id)===String(op?.mapVersion) && String(e.next_stop_number)===String(next?.number) &&
            (!e.vehicle_id || !input.vehicleId || e.vehicle_id===input.vehicleId) &&
            (!e.project_id || !input.projectId || e.project_id===input.projectId) && time(e.calculated_at)===opTime &&
            (e.source_run_id==null || String(e.source_run_id)===String(op?.sourceRun)) &&
            finite(e.eta_seconds) && e.eta_seconds===op?.etaSeconds && (e.confidence==null || ['MEDIUM','HIGH'].includes(e.confidence)));
        const hasEta=finite(op?.etaSeconds) && op.etaSeconds>=0;
        const etaValid=gps==='live' && coherent && !skipPending && etaIdentity && next && !current && ['moving','departed','approaching'].includes(activity) && hasEta;
        const etaConfidence=etaValid?'valid':hasEta && (!coherent || gps!=='live' || !etaIdentity)?'outdated':'unavailable';
        const local=clock(now), schedule=input.schedule;
        const scheduleValid=schedule && schedule.verifiedForVehicle===true && schedule.vehicleId===input.vehicleId && schedule.date===local.date && finite(schedule.receivedAt) && now-schedule.receivedAt>=0 && now-schedule.receivedAt<=90000 &&
            Array.isArray(schedule.times) && schedule.times.every(t=>typeof t==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t));
        const times=scheduleValid?[...new Set(schedule.times)].sort():[];
        const departure=times.find(t=>t>=local.time)||null;
        let service='unknown', serviceMessage='';
        if (scheduleValid) {
            service='scheduled';
            serviceMessage=!times.length?'No scheduled tours today':local.time<times[0]?'Tours start at '+times[0]:!departure?'No more scheduled departures today':'';
            // The verified timetable complements activity; it does not overwrite it.
        }
        // A departure timetable is not evidence a tour is operating or has finished.
        const etaText=etaValid?(op.etaSeconds<60?'Estimated arrival · less than 1 min':'Estimated arrival · ~'+Math.round(op.etaSeconds/60)+' min'):'';
        const distanceText=passengerState==='approaching'&&!current&&distance!==null?Math.round(distance)+' m to the stop':'';
        const timing=etaText || distanceText || (departure?'Next scheduled departure · '+departure:'');
        const observed=valid?new Date(recorded).toISOString():null;
        const destination=passengerState==='approaching'&&current?current:next;
        const nextConfirmedStop=gps==='live'&&coherent&&!skipPending?destination:null;
        const secondary=['at_stop','parked','departing'].includes(passengerState)&&nextConfirmedStop?'Next stop · '+nextConfirmedStop.name:'';
        const markerVisible=!!valid && quality && !input.unavailable && gps!=='unavailable';
        const markerTone=gps!=='live'?'grey':passengerState==='approaching'?'amber':['at_stop','parked'].includes(passengerState)?'blue':['moving','departing'].includes(passengerState)&&activityConfidence==='confirmed'?'green':'grey';
        const model={service,serviceMessage,activity,passengerState,activityConfidence,positionFreshness:gps,gps,etaConfidence,parkingVerified,markerVisible,markerTone,nextConfirmedStop,currentStop:associationValid?current:null,nextStop:next,completedStops:op?completed:null,
            coherent,positionValid:!!valid,qualityAccepted:quality,lastObservationAt:observed,ageSeconds:valid?Math.max(0,age):null,
            message,secondary,timing,etaText,etaSeconds:etaValid?op.etaSeconds:null,scheduledDeparture:departure,
            currentConfirmed:(gps==='live'&&coherent&&associationValid&&!!current&&passengerState==='at_stop')||parkingVerified,locationHistorical:gps!=='live',
            stopStatuses:[],progressKnown:!!op,progressText:op?(gps==='live'&&coherent?'Stops observed · ':'Previously observed · ')+completed.length+' of '+stops.length+' stops':'Journey progress not yet confirmed'};
        model.stopStatuses=stops.map(s=>{
            const at=model.currentConfirmed && s.number===current.number;
            const target=gps==='live'&&coherent&&!skipPending&&s.number===nextConfirmedStop?.number;
            const seen=completed.includes(s.number);
            const departed=seen && op?.lastDeparted!=null && s.number===String(op.lastDeparted) && !at;
            const short={at_stop:'At this stop',parked:'Parked here',approaching:'Approaching',departing:'Departing',moving:'On the way'};
            let label=at?(short[passengerState]||message):target?(['moving','approaching'].includes(passengerState)?short[passengerState]:'Next stop'):seen?'Previously observed':'Tour stop';
            if(activity==='departed'&&s.number===departureStop?.number)label='Departing';
            if (!at && historicalStop && s.number===historicalStop.number && gps!=='live') label='Last seen here';
            if (target && etaValid) label+=' · '+etaText;
            return {...s,current:at,next:!!target,completed:seen,label,bridgeState:departed?'departed':at?'current':target?'next':'upcoming',eta:target?etaText:''};
        });
        return model;
    }
    root.touristState={resolve,clock};
})(typeof window!=='undefined'?window:globalThis);
