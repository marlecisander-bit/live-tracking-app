/* ============================================================
   USER GPS
============================================================ */

function startUserLocation() {


    if (
        userLocationStarted
    ) {

        return;

    }


    userLocationStarted =
        true;


    if (
        !navigator.geolocation
    ) {


        showToast(
            'Location not supported'
        );


        return;

    }


    watchID = navigator
        .geolocation
        .watchPosition(

            updateUserPosition,

            userLocationError,

            {

                enableHighAccuracy:
                    true,

                timeout:
                    15000,

                maximumAge:
                    5000

            }

        );

}



function updateUserPosition(position) {


    var latitude =
        position.coords.latitude;


    var longitude =
        position.coords.longitude;


    var accuracy =
        position.coords.accuracy;


    userAccuracyMeters =
        Number(accuracy) || null;


    userPosition =
        L.latLng(
            latitude,
            longitude
        );


    if (
        !userMarker
    ) {


        userMarker =
            L.marker(

                userPosition,

                {

                    icon:
                        createUserIcon(),

                    zIndexOffset:
                        1800

                }

            )
            .addTo(map);


        userMarker.bindPopup(
            '<strong>You are here</strong>'
        );

    }


    else {


        userMarker
            .setLatLng(
                userPosition
            );

    }


    if (
        !userAccuracyCircle
    ) {


        userAccuracyCircle =
            L.circle(

                userPosition,

                {

                    radius:
                        accuracy,

                    weight:
                        1,

                    opacity:
                        0.35,

                    fillOpacity:
                        0.06

                }

            )
            .addTo(map);

    }


    else {


        userAccuracyCircle
            .setLatLng(
                userPosition
            );


        userAccuracyCircle
            .setRadius(
                accuracy
            );

    }


    updateSmartRouteInformation();


    updateNearestStopCard();

}



function userLocationError(error) {

    if (watchID !== null) {
        navigator.geolocation.clearWatch(watchID);
        watchID = null;
    }
    userLocationStarted = false;


    var message =
        'Location unavailable';


    if (
        error.code === 1
    ) {

        message =
            'Location permission denied';

    }


    showToast(
        message
    );

}




/* ============================================================
   NEAREST STOP + WALK TO STOP
============================================================ */

function getCurrentArrivalsForNearestStop() {

    if (
        !vanPosition
        ||
        !activeRouteFeature
        ||
        operationalLegs.length === 0
    ) {
        return [];
    }

    var snapped =
        turf.nearestPointOnLine(
            activeRouteFeature,
            turf.point([
                vanPosition.lng,
                vanPosition.lat
            ]),
            {
                units: 'kilometers'
            }
        );

    var vanLocationKm =
        Number(
            snapped.properties.location
        );

    var currentLeg =
        detectCurrentOperationalLeg(
            vanLocationKm
        );

    if (!currentLeg) {
        return [];
    }

    return calculateUpcomingArrivals(
        vanLocationKm,
        currentLeg
    );
}


function updateNearestStopCard() {

    var card =
        document.getElementById(
            'nearest-stop-card'
        );

    if (
        !userPosition
        ||
        stopRecords.length === 0
    ) {

        nearestStopRecord = null;
        nearestStopDistanceKm = null;

        card.classList.remove(
            'visible'
        );

        return;
    }

    var userPoint =
        turf.point([
            userPosition.lng,
            userPosition.lat
        ]);

    var bestStop =
        null;

    var bestDistance =
        Infinity;

    stopRecords.forEach(
        function(stop) {

            var distance =
                turf.distance(
                    userPoint,
                    turf.point(
                        stop.feature
                        .geometry
                        .coordinates
                    ),
                    {
                        units:
                            'kilometers'
                    }
                );

            if (
                distance <
                bestDistance
            ) {

                bestDistance =
                    distance;

                bestStop =
                    stop;
            }
        }
    );

    if (!bestStop) {

        card.classList.remove(
            'visible'
        );

        return;
    }

    nearestStopRecord =
        bestStop;

    nearestStopDistanceKm =
        bestDistance;


    document
        .getElementById(
            'nearest-stop-label'
        )
        .innerText =
        (
            userAccuracyMeters !== null
            &&
            userAccuracyMeters > 100
        )
        ?
            'NEAREST STOP · APPROX.'
        :
        'NEAREST STOP';


    var p =
        bestStop.feature
        .properties || {};

    document
        .getElementById(
            'nearest-stop-name'
        )
        .innerText =
        (
            p.stopNumber
            ?
            p.stopNumber + '. '
            :
            ''
        )
        +
        (
            p.name ||
            'Sightseeing Stop'
        );

    document
        .getElementById(
            'nearest-stop-distance'
        )
        .innerText =
        formatDistance(
            bestDistance
        )
        +
        ' from you';

    var etaText =
        isVanGPSStale()
        ?
        'Location delayed'
        :
        '--';

    var arrivals =
        getCurrentArrivalsForNearestStop();

    var matchingArrival =
        null;

    arrivals.forEach(
        function(arrival) {

            if (
                arrival.stop ===
                bestStop
            ) {

                matchingArrival =
                    arrival;
            }
        }
    );

    if (
        matchingArrival
        &&
        !isVanGPSStale()
    ) {

        applyBackendEtaToArrival(
            matchingArrival
        );

        etaText =
            formatETA(
                matchingArrival.etaMinutes
            );
    }

    document
        .getElementById(
            'nearest-stop-van-eta'
        )
        .innerHTML =
        'Van <strong>' +
        escapeHTML(
            etaText
        ) +
        '</strong>';

    card.classList.add(
        'visible'
    );
}


function walkToNearestStop() {

    if (!nearestStopRecord) {

        showToast(
            'Nearest stop unavailable'
        );

        return;
    }

    var coords =
        nearestStopRecord
        .feature
        .geometry
        .coordinates;

    var destination =
        coords[1] +
        ',' +
        coords[0];

    var url =
        'https://www.google.com/maps/dir/?api=1' +
        '&destination=' +
        encodeURIComponent(
            destination
        ) +
        '&travelmode=walking';

    if (
        userPosition
    ) {

        url +=
            '&origin=' +
            encodeURIComponent(
                userPosition.lat +
                ',' +
                userPosition.lng
            );
    }

    /* Use the current tab. On iOS, opening Google Maps in a new tab can leave
       a blank intermediary tab behind when the native Maps app launches. */
    window.location.assign(url);
}


/* ============================================================
   FIND USER / VAN
============================================================ */

function findUser() {


    if (
        !userLocationStarted
    ) {


        startUserLocation();


        showToast(
            'Requesting your location...'
        );


        return;

    }


    if (
        !userPosition
    ) {


        showToast(
            'Waiting for your GPS...'
        );


        return;

    }


    map.setView(
        userPosition,
        16
    );


    userMarker
        .openPopup();

}



function findVan() {


    if (
        !vanPosition
    ) {


        showToast(
            'Waiting for van GPS...'
        );


        return;

    }


    map.setView(
        vanPosition,
        VAN_FOLLOW_ZOOM
    );

}
