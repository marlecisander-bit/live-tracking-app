// Display adapters only. Operational state comes from the single provider worker.
var publicUiArrival = null;
function operationalStopDetails(number, fallbackName) {
 if(number===null||number===undefined)return null;
 var record=findStopRecordByNumber(number);
 return {number:String(number),name:record?.feature.properties.name||fallbackName||'Stop',record};
}
function formatOperationalStop(stop){return stop?stop.number+'. '+stop.name:'--';}
function renderVehicleOperationalStatus(status) {

    window.publicOperationalStatus = status;

    var card = document.getElementById('next-card');
    var stateLabel = document.getElementById('next-label');
    var messageLabel = document.getElementById('van-message-label');
    var mainMessage = document.getElementById('van-movement-status');
    var destinationLabel = document.getElementById('next-destination-label');
    var destination = document.getElementById('next-stop-name');

    card.classList.remove('parked', 'en-route', 'arriving', 'unknown');
    card.classList.add(status.state.replace('_', '-'));

    if (status.state === 'parked') {
        stateLabel.innerText = 'AT STOP';
        messageLabel.innerText = 'Van parked at';
        mainMessage.innerText = formatOperationalStop(status.currentStop);
        destinationLabel.innerText = 'Next';
    }
    else if (status.state === 'stationary') {
        stateLabel.innerText = 'STOPPED';
        messageLabel.innerText = 'Van status';
        mainMessage.innerText = 'Van stationary';
        destinationLabel.innerText = 'Next';
    }
    else if (status.state === 'arriving') {
        stateLabel.innerText = 'ARRIVING';
        messageLabel.innerText = 'Van arriving at';
        mainMessage.innerText = formatOperationalStop(status.currentStop || status.nextStop);
        destinationLabel.innerText = 'Going to';
    }
    else if (status.state === 'en_route') {
        stateLabel.innerText = 'EN ROUTE';
        messageLabel.innerText = status.previousStop ? 'Van departed from' : 'Live vehicle';
        mainMessage.innerText = status.previousStop
            ? formatOperationalStop(status.previousStop)
            : 'On the way';
        destinationLabel.innerText = 'Going to';
    }
    else {
        stateLabel.innerText = 'VAN STATUS';
        messageLabel.innerText = 'Live vehicle';
        mainMessage.innerText = 'Calculating route position...';
        destinationLabel.innerText = 'Next stop';
    }

    destination.innerText = formatOperationalStop(status.nextStop);
    document.getElementById('eta-value').innerText = formatETA(status.etaMinutes, {confidence: status.confidence, atStop: status.state === 'parked'});
    document.getElementById('next-stop-distance').innerText = formatDistance(
        status.state === 'arriving'
        ? status.physicalDistanceToNextKm
        : status.remainingDistanceKm
    );
    if (window.publicPresentation) window.publicPresentation.refresh(status);
}


function renderVehicleLoadingStatus(message) {

    document.getElementById('next-card').className = 'unknown';
    document.getElementById('next-label').innerText = 'VAN STATUS';
    document.getElementById('van-message-label').innerText = 'Live vehicle';
    document.getElementById('van-movement-status').innerText = message;
    document.getElementById('next-destination-label').innerText = 'Next stop';
    document.getElementById('next-stop-name').innerText = '--';
    document.getElementById('eta-value').innerText = '--';
    document.getElementById('next-stop-distance').innerText = '--';
    if (window.publicPresentation) window.publicPresentation.refresh();
}


function updateSmartRouteInformation() {
 const op=getNormalizedLiveState();
 if(!op){renderVehicleLoadingStatus('Locating van...');renderArrivalList([]);return;}
 const status={state:op.status==='PARKED'?'parked':op.status==='ARRIVING'?'arriving':'en_route',
 currentStop:operationalStopDetails(op.currentStop),nextStop:operationalStopDetails(op.nextStop),
 etaMinutes:op.etaSeconds===null?null:op.etaSeconds/60,remainingDistanceKm:op.distanceToNextMetres===null?null:op.distanceToNextMetres/1000};
 renderVehicleOperationalStatus(status);
 const arrivals=calculateUpcomingArrivals();
 renderArrivalList(arrivals);updateStopPopups(arrivals);updateNearestStopCard();
}
