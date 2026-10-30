// One public view model. RC1 state is consumed, never advanced in the browser.
var publicUiArrival = null;
var touristSession = window.touristState.createSession();
function operationalStopDetails(number, fallbackName) {
    var record=findStopRecordByNumber(number);
    return record?{number:String(number),name:record.feature.properties.name||fallbackName,record}:null;
}
function formatOperationalStop(stop){return stop?stop.number+'. '+stop.name:'--';}
function getTouristInformation() {
    var routePosition=null;
    if(canonicalLivePosition&&activeRouteFeature){try{var projected=turf.nearestPointOnLine(activeRouteFeature,turf.point([canonicalLivePosition.longitude,canonicalLivePosition.latitude]),{units:"kilometers"});var targetNumber=vehicleStopState?.operational_state?.currentStop??vehicleStopState?.operational_state?.nextStop;var leg=operationalLegs.find(l=>String(l.to.feature.properties.stopNumber)===String(targetNumber));routePosition={direction:leg?.direction||1,wrap:routeProperties.directionMode!=="twoway",alongMetres:projected.properties.location*1000,offRouteMetres:projected.properties.dist*1000,lengthMetres:routeLengthKm*1000};}catch{}}
    return touristSession.resolve({routePosition,position:canonicalLivePosition,stopState:vehicleStopState,eta:vehicleEtaState,
        mapVersion:currentPublishedId,vehicleId:VEHICLE_ID,projectId:window.PROJECT_ID,
        quality:publicGpsQuality,unavailable:window.publicPresentation?.locationUnavailable||window.selectedTracking.health?.(supabaseClient,VEHICLE_ID)?.failed,
        config:window.appConfig.trackingV2,schedule:window.touristSchedule?.current,
        stops:stopRecords.map(r=>{var p=r.feature.properties;return {id:p.objectId,number:p.stopNumber,name:p.name,active:p.active,alongMetres:Number.isFinite(r.locationKm)?r.locationKm*1000:null,coordinates:r.feature.geometry.coordinates};})});
}
function updateSmartRouteInformation() {
    if (!window.touristState) return;
    var model=getTouristInformation();
    window.publicOperationalStatus=model;
    window.publicPresentation.render(model);
    renderArrivalList();updateStopPopups();updateNearestStopCard();
}
