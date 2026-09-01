/* ============================================================
   VAN GPS
============================================================ */

function loadVanPosition() {
    var preference = window.gpsSource ? window.gpsSource.get() : 'automatic';
    if (preference === 'scorpion') {
        loadScorpionPosition();
        return;
    }
    loadPixelPosition(preference === 'automatic');
}

var pixelPositionChannel = null;

function subscribeToPixelPosition() {
    if (pixelPositionChannel) supabaseClient.removeChannel(pixelPositionChannel);
    pixelPositionChannel = supabaseClient
        .channel('pixel-position-' + VEHICLE_ID)
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'vehicle_positions',
            filter: 'vehicle_id=eq.' + VEHICLE_ID
        }, function(payload) {
            var row = payload && payload.new;
            if (!row || (window.PROJECT_ID && row.project_id !== window.PROJECT_ID)) return;
            var preference = window.gpsSource ? window.gpsSource.get() : 'automatic';
            if (preference === 'scorpion') return;
            updateVanMarker({
                lat: row.latitude, lng: row.longitude, viteza: row.speed_kmh,
                directie: row.bearing_deg == null ? row.derived_course_deg : row.bearing_deg,
                source_recorded_at: row.source_recorded_at || row.received_at
            }, 'Google Pixel');
        })
        .subscribe();
}

async function loadPixelPosition(allowFallback) {
    if (vanPositionRequestInFlight || document.hidden) return;
    vanPositionRequestInFlight = true;
    var fallbackStarted = false;
    try {
        var pixelQuery = supabaseClient
            .from('vehicle_positions')
            .select('latitude,longitude,speed_kmh,bearing_deg,derived_course_deg,source_recorded_at,received_at,quality_state')
            .eq('vehicle_id', VEHICLE_ID);
        if (window.PROJECT_ID) pixelQuery = pixelQuery.eq('project_id', window.PROJECT_ID);
        var result = await pixelQuery.maybeSingle();
        if (result.error) throw result.error;

        var row = result.data;
        var recordedAt = getTrackerRecordedAt(row);
        var pixelIsFresh = row && recordedAt !== null && Date.now() - recordedAt <= PIXEL_GPS_FRESH_AFTER_MS;
        if (row && (!allowFallback || pixelIsFresh)) {
            updateVanMarker({
                lat: row.latitude,
                lng: row.longitude,
                viteza: row.speed_kmh,
                directie: row.bearing_deg == null ? row.derived_course_deg : row.bearing_deg,
                source_recorded_at: row.source_recorded_at || row.received_at
            }, 'Google Pixel');
            return;
        }

        if (allowFallback) {
            vanPositionRequestInFlight = false;
            fallbackStarted = true;
            loadScorpionPosition();
        } else if (!row && Date.now() - lastVanRequestErrorAt > 30000) {
            lastVanRequestErrorAt = Date.now();
            showToast('Waiting for the van GPS signal');
        }
    } catch (error) {
        if (allowFallback) {
            vanPositionRequestInFlight = false;
            fallbackStarted = true;
            loadScorpionPosition();
        } else if (Date.now() - lastVanRequestErrorAt > 30000) {
            lastVanRequestErrorAt = Date.now();
            showToast('Van GPS is temporarily unavailable');
        }
    } finally {
        if (!fallbackStarted) vanPositionRequestInFlight = false;
    }
}

function loadScorpionPosition() {

    if (vanPositionRequestInFlight || document.hidden) return;
    vanPositionRequestInFlight = true;


    var callbackName =

        'scorpionGPS_' +
        Date.now();


    var script = null;
    var requestTimeout = null;

    function finishVanRequest() {
        if (requestTimeout) window.clearTimeout(requestTimeout);
        delete window[callbackName];
        if (script && script.parentNode) script.parentNode.removeChild(script);
        vanPositionRequestInFlight = false;
    }

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
                        data.markers[0],
                        'ScorpionTrack'
                    );

                }

            }


            finally {


                finishVanRequest();

            }

        };


    script =
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

            finishVanRequest();

            if (Date.now() - lastVanRequestErrorAt > 30000) {
                lastVanRequestErrorAt = Date.now();
                showToast('Van location is temporarily unavailable');
            }

        };

    requestTimeout = window.setTimeout(function() {
        finishVanRequest();
        if (Date.now() - lastVanRequestErrorAt > 30000) {
            lastVanRequestErrorAt = Date.now();
            showToast('Van location is taking longer than expected');
        }
    }, 10000);


    document.body
        .appendChild(
            script
        );

}

function getTrackerRecordedAt(data) {
    var candidates = [
        data && data.source_recorded_at,
        data && data.recorded_at,
        data && data.gpsTime,
        data && data.timestamp,
        data && data.datetime,
        data && data.dataOra
    ];

    for (var index = 0; index < candidates.length; index += 1) {
        var candidate = candidates[index];
        if (candidate === null || candidate === undefined || candidate === '') continue;
        var numeric = Number(candidate);
        var parsed = Number.isFinite(numeric)
            ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric)
            : new Date(candidate);
        if (Number.isFinite(parsed.getTime())) return parsed.getTime();
    }

    return null;
}



/* ============================================================
   UPDATE VAN
============================================================ */

function moveVanMarkerSmoothly(targetPosition, snapImmediately) {
    var now = Date.now();
    var elapsedSinceTarget = lastVanMarkerTargetAt === null
        ? GPS_UPDATE_INTERVAL
        : now - lastVanMarkerTargetAt;
    lastVanMarkerTargetAt = now;

    if (vanMarkerAnimationFrame !== null) {
        window.cancelAnimationFrame(vanMarkerAnimationFrame);
        vanMarkerAnimationFrame = null;
    }

    var startPosition = vanMarker.getLatLng();
    var movementMeters = startPosition.distanceTo(targetPosition);
    var reducedMotion = window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (
        snapImmediately
        || reducedMotion
        || document.hidden
        || movementMeters < 1
        || movementMeters > 1000
    ) {
        vanMarker.setLatLng(targetPosition);
        return 0;
    }

    /* Finish shortly before the next expected poll. This keeps movement
       continuous while ensuring the icon never invents a position beyond
       the newest coordinate supplied by the tracker. */
    var duration = Math.max(
        250,
        Math.min(2000, elapsedSinceTarget * 0.9)
    );
    var startedAt = performance.now();

    function animateFrame(frameTime) {
        var progress = Math.min(1, (frameTime - startedAt) / duration);
        vanMarker.setLatLng(L.latLng(
            startPosition.lat + (targetPosition.lat - startPosition.lat) * progress,
            startPosition.lng + (targetPosition.lng - startPosition.lng) * progress
        ));

        if (progress < 1) {
            vanMarkerAnimationFrame = window.requestAnimationFrame(animateFrame);
        }
        else {
            vanMarkerAnimationFrame = null;
        }
    }

    vanMarkerAnimationFrame = window.requestAnimationFrame(animateFrame);
    return duration;
}

function updateVanMarker(data, gpsSourceName) {

    var previousVanPosition = vanPosition;
    var previousVanHeading = vanHeading;


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
        getTrackerRecordedAt(data) || Date.now();

    var nextGpsSource = gpsSourceName || 'GPS';
    var gpsSourceChanged = Boolean(
        activeVanGpsSource && activeVanGpsSource !== nextGpsSource
    );

    /* Do not average speeds collected by two different trackers. */
    if (gpsSourceChanged) {
        speedHistory.length = 0;
    }

    activeVanGpsSource = nextGpsSource;


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


        var markerAnimationDuration = moveVanMarkerSmoothly(
            vanPosition,
            gpsSourceChanged
        );


        if (
            previousVanHeading === null
            || vanHeading === null
            || Math.abs(previousVanHeading - vanHeading) >= 5
        ) {
            vanMarker.setIcon(createVanIcon(direction));
        }

    }


    if (
        followVan
    ) {


        var movementMeters = previousVanPosition
            ? previousVanPosition.distanceTo(vanPosition)
            : Infinity;

        if (!previousVanPosition || map.getZoom() !== VAN_FOLLOW_ZOOM) {
            map.setView(vanPosition, VAN_FOLLOW_ZOOM, { animate: false });
        } else if (movementMeters >= 20) {
            map.panTo(vanPosition, {
                animate: true,
                duration: markerAnimationDuration > 0
                    ? markerAnimationDuration / 1000
                    : 0.35
            });
        }

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
