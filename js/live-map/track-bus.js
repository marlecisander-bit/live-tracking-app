/* ============================================================
   VAN GPS
============================================================ */

function loadVanPosition() {


    var callbackName =

        'scorpionGPS_' +
        Date.now();


    window[callbackName] =

        function(data) {


            try {


                if (
                    data
                    &&
                    data.markers
                    &&
                    data.markers.length > 0
                ) {


                    updateVanMarker(
                        data.markers[0]
                    );

                }

            }


            finally {


                delete window[
                    callbackName
                ];


                if (
                    script.parentNode
                ) {


                    script.parentNode
                    .removeChild(
                        script
                    );

                }

            }

        };


    var script =
        document.createElement(
            'script'
        );


    script.src =

        'https://track.scorpiontrack.ro/TrackingTool/src/getPosition.ashx'

        +

        '?callback='

        +

        encodeURIComponent(
            callbackName
        )

        +

        '&t='

        +

        encodeURIComponent(
            SCORPION_TOKEN
        )

        +

        '&format=json'

        +

        '&_='

        +

        Date.now();


    script.onerror =
        function() {

            showToast(
                'Unable to refresh van location'
            );

        };


    document.body
        .appendChild(
            script
        );

}



/* ============================================================
   UPDATE VAN
============================================================ */

function updateVanMarker(data) {


    var latitude =
        Number(
            data.lat
        );


    var longitude =
        Number(
            data.lng
        );


    var speed =
        Number(
            data.viteza
        ) || 0;


    var direction =
        Number(
            data.directie
        );


    if (
        !Number.isFinite(
            latitude
        )
        ||
        !Number.isFinite(
            longitude
        )
    ) {

        return;

    }


    vanHeading =
        Number.isFinite(
            direction
        )
        ?
        normalizeAngle(
            direction
        )
        :
        null;


    vanSpeed =
        speed;


    lastVanGPSReceivedAt =
        Date.now();


    recordSpeed(
        speed
    );


    vanPosition =
        L.latLng(
            latitude,
            longitude
        );


    if (
        !vanMarker
    ) {


        vanMarker =
            L.marker(

                vanPosition,

                {

                    icon:
                        createVanIcon(
                            direction
                        ),

                    zIndexOffset:
                        2000

                }

            )
            .addTo(map);

    }


    else {


        vanMarker
            .setLatLng(
                vanPosition
            );


        vanMarker
            .setIcon(

                createVanIcon(
                    direction
                )

            );

    }


    if (
        followVan
    ) {


        map.panTo(
            vanPosition,
            {
                animate: true
            }
        );

    }


    selectBestRouteContextForVan();


    updateGPSStatus();


    updateSmartRouteInformation();

}



/* ============================================================
   GPS STATUS
============================================================ */

function updateGPSStatus() {


    var badge =
        document
        .getElementById(
            'live-badge'
        );


    var text =
        document
        .getElementById(
            'live-badge-text'
        );


    var age =
        getGPSAgeMs();


    if (
        age === null
    ) {

        text.innerText =
            'CONNECTING';

        return;

    }


    var ageText =
        formatGPSAge(
            age
        );


    if (
        age >
        GPS_STALE_AFTER_MS
    ) {


        badge
            .classList
            .add(
                'stale'
            );


        text.innerText =
                'DELAYED · ' +
            ageText;


        setETAUnavailable(
            'Van location is delayed. Live ETA is temporarily unavailable.'
        );

    }


    else {


        badge
            .classList
            .remove(
                'stale'
            );


        text.innerText =
                'LIVE · ' +
            ageText;


        /*
           Recalculate so ETA is restored
           automatically after GPS recovers.
        */

        if (
            vanPosition
            &&
            activeRouteFeature
        ) {

            updateSmartRouteInformation();

        }

    }

}



setInterval(

    updateGPSStatus,

    10000

);
