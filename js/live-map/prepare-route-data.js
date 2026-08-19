/* ============================================================
   NORMALIZE ROUTE
============================================================ */

function normalizeRouteFeature(feature) {


    if (
        !feature ||
        !feature.geometry
    ) {

        return null;

    }


    if (
        feature.geometry.type ===
        'LineString'
    ) {


        return turf.lineString(

            feature.geometry.coordinates,

            feature.properties || {}

        );

    }


    if (
        feature.geometry.type ===
        'MultiLineString'
    ) {


        var longest =
            null;


        var longestLength =
            -1;


        feature.geometry.coordinates
            .forEach(

                function(coords) {


                    var line =
                        turf.lineString(
                            coords
                        );


                    var length =
                        turf.length(

                            line,

                            {
                                units:
                                    'kilometers'
                            }

                        );


                    if (
                        length >
                        longestLength
                    ) {


                        longestLength =
                            length;


                        longest =
                            line;

                    }

                }

            );


        return longest;

    }


    return null;

}



/* ============================================================
   STOP LOCATION ON ROUTE
============================================================ */

function calculateStopRouteLocations() {


    if (
        !activeRouteFeature
    ) {

        return;

    }


    stopRecords.forEach(

        function(stop) {


            var coords =
                stop.feature
                .geometry
                .coordinates;


            var snapped =
                turf.nearestPointOnLine(

                    activeRouteFeature,

                    turf.point(
                        coords
                    ),

                    {
                        units:
                            'kilometers'
                    }

                );


            stop.locationKm =
                Number(
                    snapped.properties.location
                );

        }

    );

}



/* ============================================================
   OPERATIONAL SEQUENCE
============================================================ */

function buildOperationalSequence() {


    operationalSequence =
        [];


    var sequence =
        Array.isArray(
            routeProperties.stopSequence
        )
        ?
        routeProperties.stopSequence
        :
        [];


    if (
        sequence.length > 0
    ) {


        sequence.forEach(

            function(stopId) {


                if (
                    stopById[stopId]
                ) {


                    operationalSequence.push(
                        stopById[stopId]
                    );

                }

            }

        );

    }


    if (
        operationalSequence.length <
        2
    ) {


        operationalSequence =

            [...stopRecords]
            .sort(

                function(a,b) {


                    return (

                        Number(
                            a.feature
                            .properties
                            .stopNumber
                        )

                        -

                        Number(
                            b.feature
                            .properties
                            .stopNumber
                        )

                    );

                }

            );

    }

}



/* ============================================================
   OPERATIONAL LEGS
============================================================ */

function buildOperationalLegs() {


    operationalLegs =
        [];


    if (
        operationalSequence.length <
        2
    ) {

        return;

    }


    var directionMode =
        routeProperties.directionMode ||
        'oneway';


    for (
        var i = 0;
        i <
        operationalSequence.length - 1;
        i++
    ) {


        var from =
            operationalSequence[i];


        var to =
            operationalSequence[i + 1];


        var difference =
            to.locationKm -
            from.locationKm;


        var direction =
            1;


        var lengthKm =
            0;


        if (
            directionMode ===
            'twoway'
        ) {


            direction =
                difference >= 0
                ?
                1
                :
                -1;


            lengthKm =
                Math.abs(
                    difference
                );

        }


        else {


            lengthKm =
                difference;


            if (
                lengthKm < 0
            ) {


                lengthKm +=
                    routeLengthKm;

            }

        }


        operationalLegs.push({

            index:
                i,

            from:
                from,

            to:
                to,

            direction:
                direction,

            lengthKm:
                lengthKm

        });

    }

}
