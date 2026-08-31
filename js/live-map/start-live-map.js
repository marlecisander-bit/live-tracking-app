/* ============================================================
   START
============================================================ */

(async function startLiveProject() {
await window.publicProject.ready;

/* Follow the sightseeing van from the moment the public map opens. */
followVan =
    true;


setActiveControl(
    'btn-find-van'
);


updateFollowIndicator();

if (window.gpsSource) {
    document.addEventListener('gpssourcechange', function() {
        vanPositionRequestInFlight = false;
        loadVanPosition();
    });
}

loadPublishedMap();


loadVanPosition();

subscribeToPixelPosition();


/*
   Read authoritative stop-detector state immediately.
*/
loadVehicleStopState();


/*
   Read route-aware ETA immediately.
*/
loadVehicleEtaState();


setInterval(

    loadVanPosition,

    GPS_UPDATE_INTERVAL

);


/*
   Keep public Live Map synchronized with stop-detector v2.5.
*/
setInterval(

    loadVehicleStopState,

    VEHICLE_STATE_UPDATE_INTERVAL

);


/*
   Keep public Live Map synchronized with eta-engine.
*/
setInterval(

    loadVehicleEtaState,

    VEHICLE_ETA_UPDATE_INTERVAL

);


subscribeToPublishedChanges();


startPublishedMapPolling();

document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        loadVanPosition();
        loadVehicleStopState();
        loadVehicleEtaState();
        updateGPSStatus();
    }
});

/* Keep Leaflet correctly sized when an iframe or website section is resized. */
if (window.ResizeObserver) {
    var liveMapResizeFrame = null;
    new ResizeObserver(function() {
        if (liveMapResizeFrame) window.cancelAnimationFrame(liveMapResizeFrame);
        liveMapResizeFrame = window.requestAnimationFrame(function() {
            map.invalidateSize({ pan: false, debounceMoveend: true });
        });
    }).observe(document.getElementById('app'));
}

})();
