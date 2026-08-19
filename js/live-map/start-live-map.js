/* ============================================================
   START
============================================================ */

/* Follow the sightseeing van from the moment the public map opens. */
followVan =
    true;


setActiveControl(
    'btn-find-van'
);


updateFollowIndicator();

loadPublishedMap();


loadVanPosition();


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
   Keep public Live Map synchronized with stop-detector v2.1.
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
