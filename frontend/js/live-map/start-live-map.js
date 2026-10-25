/* ============================================================
   START
============================================================ */

(async function startLiveProject() {
try { await window.publicProject.ready; }
catch (error) { hideMapLoading(); showToast('This tour project is unavailable.'); return; }

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








document.addEventListener('selectedtrackingchange', function(event) {
    if (document.hidden || !window.appConfig.selectedTrackingRealtimeEnabled || event.detail.vehicleId !== VEHICLE_ID) return;
    loadVanPosition();

});


setInterval(

    loadVanPosition,

    GPS_UPDATE_INTERVAL

);










subscribeToPublishedChanges();


startPublishedMapPolling();

document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        loadVanPosition();

        updateGPSStatus();
        window.setTimeout(function() {
            map.invalidateSize({ pan: false, debounceMoveend: true });
        }, 100);
    }
});

/* iOS may restore this page from its back-forward cache after handing off to
   Google Maps. Redraw Leaflet once the restored viewport is visible again. */
window.addEventListener('pageshow', function() {
    window.requestAnimationFrame(function() {
        map.invalidateSize({ pan: false, debounceMoveend: true });
    });
    window.setTimeout(function() {
        map.invalidateSize({ pan: false, debounceMoveend: true });
    }, 300);
});

/* Keep Leaflet correctly sized when an iframe or website section is resized. */
if (window.ResizeObserver) {
    var liveMapResizeFrame = null;
    new ResizeObserver(function() {
        if (liveMapResizeFrame) window.cancelAnimationFrame(liveMapResizeFrame);
        liveMapResizeFrame = window.requestAnimationFrame(function() {
            map.invalidateSize({ pan: false, debounceMoveend: true });
            if (followVan && vanPosition) map.panTo(vanPosition, { animate: false });
        });
    }).observe(document.getElementById('app'));
}

})();

// Immediate recovery; shared snapshot reader coalesces these consumers into one request.
['online','pageshow'].forEach(function(name){window.addEventListener(name,function(){if(document.hidden)return;loadVanPosition();});});
