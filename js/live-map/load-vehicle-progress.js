/* ============================================================
   BACKEND VEHICLE STOP STATE
   The public Live Map reads the authoritative sequence state
   produced by stop-detector v2.5.
============================================================ */

async function refreshStopDetector() {

    var now = Date.now();

    if (
        stopDetectorRequestInFlight
        || now - lastStopDetectorRequestAt < 15000
    ) {

        return;

    }

    stopDetectorRequestInFlight = true;
    lastStopDetectorRequestAt = now;

    try {

        var result =
            await supabaseClient.functions.invoke(
                'stop-detector',
                {
                    body: {
                        source: 'public-live-map',
                        project_id: window.PROJECT_ID,
                        vehicle_id: VEHICLE_ID
                    }
                }
            );

        if (result.error) {

            console.warn(
                'stop-detector refresh failed:',
                result.error
            );

        }

    }
    catch (error) {

        console.warn(
            'Unable to refresh stop-detector:',
            error
        );

    }
    finally {

        stopDetectorRequestInFlight = false;

    }

}

async function loadVehicleStopState() {

    if (vehicleStopStateRequestInFlight || document.hidden) return;
    vehicleStopStateRequestInFlight = true;

    try {

        await refreshStopDetector();

        var stateQuery = supabaseClient
            .from(
                'vehicle_stop_state'
            )
            .select(
                'vehicle_id,current_stop_id,current_stop_name,current_stop_number,' +
                'last_completed_stop_id,last_completed_stop_number,' +
                'expected_next_stop_id,expected_next_stop_number,' +
                'sequence_index,map_version_id,updated_at'
            )
            .eq(
                'vehicle_id',
                VEHICLE_ID
            );
        if (window.PROJECT_ID) stateQuery = stateQuery.eq('project_id', window.PROJECT_ID);
        const { data, error } = await stateQuery.maybeSingle();


        if (error) {

            console.error(
                'vehicle_stop_state error:',
                error
            );

            return;
        }


        vehicleStopState =
            data || null;


        vehicleStopStateLoaded =
            true;


        updateRouteCycleResetState();


        /*
           If the backend already knows which Stop is next,
           synchronize the route segment used for ETA.
        */

        syncRouteContextWithBackendState();


        if (
            vanPosition
            &&
            activeRouteFeature
        ) {

            updateSmartRouteInformation();

        }

    }
    catch (error) {

        console.error(
            'Unable to load vehicle_stop_state:',
            error
        );

    }
    finally {

        vehicleStopStateRequestInFlight = false;

    }

}


/* ============================================================
   ROUTE CYCLE RESET
   Stop 1 is the route origin. Once it is detected, keep the
   frontend on the new 1 -> 2 cycle until Stop 2 is reached.
   This also shields the UI from a stale ETA row from the prior
   cycle (for example, one still pointing to Stop 3).
============================================================ */

function stopNumberEquals(value, expected) {

    return String(value ?? '').trim() === String(expected);

}


function updateRouteCycleResetState() {

    if (!vehicleStopState) {
        return;
    }


    if (stopNumberEquals(vehicleStopState.current_stop_number, 1)) {
        routeCycleResetActive = true;
        return;
    }


    if (vanWasAtRouteOrigin) {
        routeCycleResetActive = true;
        return;
    }


    if (
        vehicleStopState.current_stop_number !== null
        &&
        vehicleStopState.current_stop_number !== undefined
        &&
        String(vehicleStopState.current_stop_number).trim() !== ''
    ) {
        routeCycleResetActive = false;
        return;
    }


    if (stopNumberEquals(vehicleStopState.last_completed_stop_number, 1)) {
        routeCycleResetActive = true;
        return;
    }


    if (
        vehicleStopState.last_completed_stop_number !== null
        &&
        vehicleStopState.last_completed_stop_number !== undefined
        &&
        String(vehicleStopState.last_completed_stop_number).trim() !== ''
    ) {
        routeCycleResetActive = false;
    }
}


function updateRouteCycleResetFromVanPosition() {

    if (!vanPosition) {
        return;
    }


    var firstStop = findStopRecordByNumber(1);
    var firstStopPosition =
        firstStop
        &&
        firstStop.layer
        &&
        typeof firstStop.layer.getLatLng === 'function'
        ? firstStop.layer.getLatLng()
        : null;


    if (!firstStopPosition) {
        return;
    }


    var isAtRouteOrigin =
        vanPosition.distanceTo(firstStopPosition) <= 120;


    if (isAtRouteOrigin && !vanWasAtRouteOrigin) {
        routeCycleResetActive = true;
    }


    vanWasAtRouteOrigin = isAtRouteOrigin;
}


function getFirstCycleDestinationNumber() {

    return getFollowingStopNumber(1) || '2';
}


function getFollowingStopNumber(currentStopNumber) {

    var sortedStops =
        stopRecords
        .slice()
        .sort(function(a, b) {
            return Number(a.feature.properties.stopNumber) - Number(b.feature.properties.stopNumber);
        });


    for (var index = 0; index < sortedStops.length; index++) {
        var properties = sortedStops[index].feature.properties || {};
        if (stopNumberEquals(properties.stopNumber, currentStopNumber)) {
            var followingIndex = (index + 1) % sortedStops.length;
            return String(sortedStops[followingIndex].feature.properties.stopNumber);
        }
    }


    return null;
}


/* ============================================================
   EXPECTED NEXT STOP NUMBER
============================================================ */

function getExpectedNextStopNumber() {

    /* A confirmed physical stop always determines its sequence successor. */
    if (
        vehicleStopState
        &&
        vehicleStopState.current_stop_number !== null
        &&
        vehicleStopState.current_stop_number !== undefined
        &&
        String(vehicleStopState.current_stop_number).trim() !== ''
    ) {
        var afterCurrentStop = getFollowingStopNumber(vehicleStopState.current_stop_number);
        if (afterCurrentStop) return afterCurrentStop;
    }


    /* Stop 1 must always restart the operational sequence toward Stop 2. */
    if (routeCycleResetActive) {
        return getFirstCycleDestinationNumber();
    }

    /*
       ETA state has first priority for tourist-facing NEXT STOP.
       This solves the station case where stop-detector still keeps
       expected_next_stop_number equal to the current stop until
       departure is confirmed.
    */

    var etaState =
        getFreshVehicleEtaState();

    if (
        etaState
        &&
        etaState.next_stop_number !== null
        &&
        etaState.next_stop_number !== undefined
        &&
        String(
            etaState.next_stop_number
        ).trim() !==
        ''
    ) {
        return String(
            etaState.next_stop_number
        ).trim();
    }


    if (!vehicleStopState) {
        return null;
    }


    if (
        vehicleStopState.expected_next_stop_number !== null
        &&
        vehicleStopState.expected_next_stop_number !== undefined
        &&
        String(
            vehicleStopState.expected_next_stop_number
        ).trim() !==
        ''
    ) {
        var stopStateExpected = String(
            vehicleStopState.expected_next_stop_number
        ).trim();

        if (stopNumberEquals(stopStateExpected, vehicleStopState.current_stop_number)) {
            return getFollowingStopNumber(vehicleStopState.current_stop_number) || stopStateExpected;
        }

        return stopStateExpected;
    }


    var stateIndex =
        Number(
            vehicleStopState.sequence_index
        );

    if (
        Number.isInteger(stateIndex)
        &&
        stateIndex >= 0
    ) {

        var globallySorted =
            stopRecords
            .slice()
            .sort(
                function(a,b) {
                    return (
                        Number(
                            a.feature.properties.stopNumber
                        )
                        -
                        Number(
                            b.feature.properties.stopNumber
                        )
                    );
                }
            );

        if (
            stateIndex <
            globallySorted.length
        ) {

            var p =
                globallySorted[
                    stateIndex
                ]
                .feature
                .properties || {};

            if (
                p.stopNumber !== undefined
                &&
                p.stopNumber !== null
            ) {
                return String(
                    p.stopNumber
                );
            }
        }
    }

    return null;
}


/* ============================================================
   FIND GLOBAL STOP BY PUBLIC NUMBER
============================================================ */

function findStopRecordByNumber(
    stopNumber
) {

    if (
        stopNumber ===
        null
        ||
        stopNumber ===
        undefined
    ) {

        return null;

    }


    var wanted =
        String(
            stopNumber
        ).trim();


    for (
        var i = 0;
        i < stopRecords.length;
        i++
    ) {

        var stop =
            stopRecords[i];


        if (
            !stop
            ||
            !stop.feature
        ) {

            continue;

        }


        var p =
            stop
            .feature
            .properties || {};


        if (
            String(
                p.stopNumber
                ?? ''
            ).trim()
            ===
            wanted
        ) {

            return stop;

        }

    }


    return null;
}


/* ============================================================
   FIND ROUTE LEG THAT ENDS AT EXPECTED STOP
   Works with the multi-route engine.
============================================================ */

function findBackendExpectedLeg(
    expectedStopNumber
) {

    if (
        !expectedStopNumber
        ||
        routeContexts.length ===
        0
    ) {

        return null;

    }


    var wanted =
        String(
            expectedStopNumber
        ).trim();


    var vanPoint =
        vanPosition
        ?
        turf.point([
            vanPosition.lng,
            vanPosition.lat
        ])
        :
        null;


    var matches =
        [];


    routeContexts.forEach(

        function(context) {

            if (
                !context
                ||
                !Array.isArray(
                    context.legs
                )
            ) {

                return;

            }


            context.legs.forEach(

                function(leg) {

                    if (
                        !leg
                        ||
                        !leg.to
                        ||
                        !leg.to.feature
                    ) {

                        return;

                    }


                    var p =
                        leg.to
                        .feature
                        .properties || {};


                    if (
                        String(
                            p.stopNumber
                            ?? ''
                        ).trim()
                        !==
                        wanted
                    ) {

                        return;

                    }


                    var routeDistance =
                        vanPoint
                        ?
                        routeDistanceFromVanKm(
                            context,
                            vanPoint
                        )
                        :
                        0;


                    matches.push({

                        context:
                            context,

                        leg:
                            leg,

                        routeDistanceKm:
                            Number.isFinite(
                                routeDistance
                            )
                            ?
                            routeDistance
                            :
                            Infinity

                    });

                }

            );

        }

    );


    if (
        matches.length ===
        0
    ) {

        return null;

    }


    matches.sort(

        function(a,b) {

            return (
                a.routeDistanceKm
                -
                b.routeDistanceKm
            );

        }

    );


    return matches[0];
}


/* ============================================================
   SYNCHRONIZE ACTIVE ROUTE WITH BACKEND EXPECTED STOP
============================================================ */

function syncRouteContextWithBackendState(expectedStopNumber) {

    expectedStopNumber =
        expectedStopNumber || getExpectedNextStopNumber();


    if (!expectedStopNumber) {

        return null;

    }


    var match =
        findBackendExpectedLeg(
            expectedStopNumber
        );


    if (!match) {

        return null;

    }


    activateRouteContext(
        match.context,
        false
    );


    currentOperationalLegIndex =
        match.leg.index;


    return match;
}
