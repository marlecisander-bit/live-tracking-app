/* Health comes from fix time; equal coordinates never make a fix stale. */
(function(root) {
    function classify(position, now) {
        if (!position) return 'GPS_OFFLINE';
        var time = Date.parse(position.source_recorded_at);
        var age = (now === undefined ? Date.now() : now) - time;
        if (!Number.isFinite(time) || age < -60000 || age > Number(root.appConfig?.trackingV2?.offlineSeconds || position.offline_seconds || 120) * 1000) return 'GPS_OFFLINE';
        if (age > Number(root.appConfig?.trackingV2?.delayedSeconds || position.delayed_seconds || 20) * 1000) return 'GPS_DELAYED';
        return ['MOVING', 'PARKED_AT_STOP', 'STATIONARY'].includes(position.movement_state) ? position.movement_state : position.speed_kmh!=null&&Number.isFinite(Number(position.speed_kmh)) ? (Number(position.speed_kmh)<=3?'STATIONARY':'MOVING') : 'UNKNOWN';
    }
    // Preserve last-reported stop context independently of transport freshness.
    // This presentation evidence never creates arrivals or resets a tour.
    function stoppedAt(position, now) {
        if (!position) return null;
        var confirmed = position.movement_state === 'PARKED_AT_STOP';
        if (!confirmed && position.reported_stopped !== true) return null;
        var number = confirmed ? position.current_stop_number : position.reported_stop_number;
        if (number === null || number === undefined) return null;
        var health = classify(position, now);
        return { number: String(number), name: confirmed ? position.current_stop_name : position.reported_stop_name,
            label: !confirmed ? 'Last reported stopped at' :
                health === 'GPS_DELAYED' || health === 'GPS_OFFLINE' ? 'Last seen parked at' : 'Van parked at' };
    }
    function describe(position, context, now) {
        now=now===undefined?Date.now():now;context=context||{};
        var cfg=root.appConfig?.trackingV2||{},age=position?(now-Date.parse(position.source_recorded_at))/1000:Infinity;
        var speed=position?.speed_kmh,knownSpeed=speed!=null&&speed!==''&&Number.isFinite(Number(speed))&&Number(speed)>=0;
        var movement=knownSpeed?(Number(speed)<=3?'STATIONARY':'MOVING'):
            ['STATIONARY','PARKED_AT_STOP'].includes(position?.movement_state)?'STATIONARY':position?.movement_state==='MOVING'?'MOVING':'UNKNOWN';
        var location=context.atStop?(context.locationState||'AT_STOP'):context.approaching?'APPROACHING_STOP':'BETWEEN_STOPS';
        var delayed=Number(cfg.delayedSeconds||position?.delayed_seconds||20),offline=Number(cfg.offlineSeconds||position?.offline_seconds||120);
        // Observed stationary Scorpion reports are ~480s apart. A bounded quiet
        // allowance preserves stop context, but never invents a device heartbeat.
        var quietLimit=Math.min(900,Math.max(offline,Number(cfg.parkedQuietSeconds||600)));
        var parkedQuiet=position?.source==='scorpiontrack'&&context.atStop&&context.stationary!==false&&movement==='STATIONARY'&&
            Number.isFinite(age)&&age>=0&&age<=quietLimit&&!context.unavailable&&!['POOR','REJECTED'].includes(context.quality);
        var health=!Number.isFinite(age)||age< -60||context.unavailable||age>(parkedQuiet?quietLimit:offline)?'OFFLINE':
            ['POOR','REJECTED'].includes(context.quality)?'DEGRADED':age>delayed?(parkedQuiet||age>Number(cfg.degradedSeconds||180)?'DEGRADED':'DELAYED'):'LIVE';
        return {health:health,movement:movement,location:location,ageSeconds:age,parkedQuiet:parkedQuiet&&age>delayed,
            lastFixAt:position?.source_recorded_at||null,lastReceivedAt:position?.received_at||null,
            // Current schema has no independent authenticated device heartbeat.
            lastTrackingSeenAt:position?.source_recorded_at||null};
    }
    root.trackingState = { classify: classify, stoppedAt: stoppedAt, describe:describe };
})(typeof window !== 'undefined' ? window : globalThis);
