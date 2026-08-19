/* ============================================================
   BACKEND VEHICLE STOP STATE
   The public Live Map reads the authoritative sequence state
   produced by stop-detector v2.1.
============================================================ */

async function loadVehicleStopState() {

    try {

        const {
            data,
            error
        } =
            await supabaseClient
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
            )
            .maybeSingle();


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

}


/* ============================================================
   EXPECTED NEXT STOP NUMBER
============================================================ */

function getExpectedNextStopNumber() {

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
        return String(
            vehicleStopState.expected_next_stop_number
        ).trim();
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

function syncRouteContextWithBackendState() {

    var expectedStopNumber =
        getExpectedNextStopNumber();


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
