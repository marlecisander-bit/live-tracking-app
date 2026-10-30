// One public view model. RC1 state is consumed, never advanced in the browser.
var publicUiArrival = null;
function operationalStopDetails(number, fallbackName) {
    var record=findStopRecordByNumber(number);
    return record?{number:String(number),name:record.feature.properties.name||fallbackName,record}:null;
}
function formatOperationalStop(stop){return stop?stop.number+'. '+stop.name:'--';}
function getTouristInformation() {
    return window.touristState.resolve({position:canonicalLivePosition,stopState:vehicleStopState,eta:vehicleEtaState,
        mapVersion:currentPublishedId,vehicleId:VEHICLE_ID,projectId:window.PROJECT_ID,
        quality:publicGpsQuality,unavailable:window.publicPresentation?.locationUnavailable,
        config:window.appConfig.trackingV2,schedule:window.touristSchedule?.current,
        stops:stopRecords.map(r=>{var p=r.feature.properties;return {id:p.objectId,number:p.stopNumber,name:p.name,active:p.active};})});
}
function updateSmartRouteInformation() {
    if (!window.touristState) return;
    var model=getTouristInformation();
    window.publicOperationalStatus=model;
    window.publicPresentation.render(model);
    renderArrivalList();updateStopPopups();updateNearestStopCard();
}
