/* ============================================================
   MULTI-ROUTE ENGINE
============================================================ */

function buildAllRouteContexts(
    activeFeatures
) {

    routeContexts = [];


    activeFeatures.forEach(

        function(feature, index) {

            var p =
                feature.properties || {};


            if (
                !feature.geometry
                ||
                (
                    feature.geometry.type !== 'LineString'
                    &&
                    feature.geometry.type !== 'MultiLineString'
                )
                ||
                p.objectType !== 'route'
            ) {

                return;
            }


            var normalized =
                normalizeRouteFeature(
                    feature
                );


            if (!normalized) {
                return;
            }


            var lengthKm =
                turf.length(
                    normalized,
                    { units: 'kilometers' }
                );


            var stopLocations =
                {};


            stopRecords.forEach(

                function(stop) {

                    var coords =
                        stop.feature.geometry.coordinates;


                    var snapped =
                        turf.nearestPointOnLine(
                            normalized,
                            turf.point(coords),
                            { units: 'kilometers' }
                        );


                    stopLocations[
                        stop.id ||
                        String(
                            stop.feature.properties.stopNumber ||
                            stop.feature.properties.name ||
                            ''
                        )
                    ] =
                        Number(
                            snapped.properties.location
                        );

                }

            );


            var context = {

                id:
                    p.objectId ||
                    ('route_' + index),

                name:
                    p.name ||
                    ('Route ' + (index + 1)),

                feature:
                    normalized,

                properties:
                    p,

                lengthKm:
                    lengthKm,

                stopLocations:
                    stopLocations,

                sequence:
                    [],

                legs:
                    []

            };


            context.sequence =
                buildContextSequence(
                    context
                );


            context.legs =
                buildContextLegs(
                    context
                );


            routeContexts.push(
                context
            );

        }

    );

}


function buildContextSequence(
    context
) {

    var sequence = [];

    var configured =
        Array.isArray(
            context.properties.stopSequence
        )
        ?
        context.properties.stopSequence
        :
        [];


    configured.forEach(

        function(stopId) {

            var base =
                stopById[stopId];


            if (!base) {
                return;
            }


            var location =
                context.stopLocations[stopId];


            if (!Number.isFinite(location)) {
                return;
            }


            sequence.push({

                id:
                    base.id,

                feature:
                    base.feature,

                layer:
                    base.layer,

                locationKm:
                    location

            });

        }

    );


    /* Fallback for older routes without Stop Order. */
    if (sequence.length < 2) {

        sequence =
            stopRecords
            .map(

                function(base) {

                    var key =
                        base.id ||
                        String(
                            base.feature.properties.stopNumber ||
                            base.feature.properties.name ||
                            ''
                        );

                    return {
                        id: base.id,
                        feature: base.feature,
                        layer: base.layer,
                        locationKm:
                            context.stopLocations[key]
                    };

                }

            )
            .filter(
                function(stop) {
                    return Number.isFinite(
                        stop.locationKm
                    );
                }
            )
            .sort(
                function(a,b) {
                    return Number(
                        a.feature.properties.stopNumber
                    ) - Number(
                        b.feature.properties.stopNumber
                    );
                }
            );

    }


    return sequence;
}


function buildContextLegs(
    context
) {

    var legs = [];

    var sequence =
        context.sequence;


    if (sequence.length < 2) {
        return legs;
    }


    var directionMode =
        context.properties.directionMode ||
        'oneway';


    for (
        var i = 0;
        i < sequence.length - 1;
        i++
    ) {

        var from = sequence[i];
        var to = sequence[i + 1];

        var difference =
            to.locationKm -
            from.locationKm;

        var direction = 1;
        var lengthKm = 0;


        if (directionMode === 'twoway') {

            direction =
                difference >= 0
                ? 1
                : -1;

            lengthKm =
                Math.abs(difference);

        }
        else {

            lengthKm =
                difference;

            if (lengthKm < 0) {
                lengthKm +=
                    context.lengthKm;
            }

        }


        legs.push({
            index: i,
            from: from,
            to: to,
            direction: direction,
            lengthKm: lengthKm
        });

    }


    return legs;
}


function activateRouteContext(
    context,
    force
) {

    if (!context) {
        return;
    }


    var changed =
        !activeRouteContext
        ||
        activeRouteContext.id !==
        context.id;


    if (!changed && !force) {
        return;
    }


    activeRouteContext =
        context;

    activeRouteFeature =
        context.feature;

    routeProperties =
        context.properties;

    routeLengthKm =
        context.lengthKm;

    operationalSequence =
        context.sequence;

    operationalLegs =
        context.legs;

    currentOperationalLegIndex =
        null;

}


function routeDistanceFromVanKm(
    context,
    vanPoint
) {

    var snapped =
        turf.nearestPointOnLine(
            context.feature,
            vanPoint,
            { units: 'kilometers' }
        );


    return turf.distance(
        vanPoint,
        snapped,
        { units: 'kilometers' }
    );
}


function selectBestRouteContextForVan() {

    if (
        !vanPosition
        ||
        routeContexts.length === 0
    ) {
        return null;
    }


    var vanPoint =
        turf.point([
            vanPosition.lng,
            vanPosition.lat
        ]);


    var best = null;
    var bestDistance = Infinity;


    routeContexts.forEach(

        function(context) {

            var distance =
                routeDistanceFromVanKm(
                    context,
                    vanPoint
                );


            if (distance < bestDistance) {
                bestDistance = distance;
                best = context;
            }

        }

    );


    /* Keep the current route at overlaps unless another route
       is meaningfully closer. This prevents route flickering. */
    if (
        activeRouteContext
        &&
        best
        &&
        activeRouteContext.id !== best.id
    ) {

        var currentDistance =
            routeDistanceFromVanKm(
                activeRouteContext,
                vanPoint
            );


        if (
            currentDistance <=
            bestDistance + 0.05
        ) {
            best = activeRouteContext;
            bestDistance = currentDistance;
        }

    }


    if (best) {
        activateRouteContext(
            best,
            false
        );
    }


    return {
        context: best,
        distanceKm: bestDistance
    };
}
