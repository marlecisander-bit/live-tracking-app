/* ============================================================
   STOPS PANEL
============================================================ */

function openStopsPanel() {

    window.stopsPanelPreviousFocus = document.activeElement;


    document
        .getElementById(
            'stops-panel'
        )
        .classList
        .add(
            'open'
        );

    document.getElementById('stops-panel').setAttribute('aria-hidden', 'false');


    document
        .getElementById(
            'panel-backdrop'
        )
        .classList
        .add(
            'visible'
        );


    renderArrivalList();

    window.setTimeout(function() {
        document.getElementById('stops-panel').focus();
    }, 260);

}



function closeStopsPanel() {


    document
        .getElementById(
            'stops-panel'
        )
        .classList
        .remove(
            'open'
        );

    document.getElementById('stops-panel').setAttribute('aria-hidden', 'true');


    document
        .getElementById(
            'panel-backdrop'
        )
        .classList
        .remove(
            'visible'
        );


    setActiveControl(
        null
    );

    if (window.stopsPanelPreviousFocus && window.stopsPanelPreviousFocus.focus) {
        window.stopsPanelPreviousFocus.focus();
    }

}



function renderArrivalList(){
 const container=document.getElementById('stop-arrivals-list');container.replaceChildren();
 const op=getNormalizedLiveState(),arrivals=calculateUpcomingArrivals();
 const records=op?op.stopOrder.map(findStopRecordByNumber).filter(Boolean):stopRecords;
 records.forEach(stop=>{
  const p=stop.feature.properties,n=String(p.stopNumber),current=op&&String(op.currentStop)===n,next=op&&String(op.nextStop)===n;
  const item=document.createElement('button');item.type='button';item.className='arrival-item';item.classList.toggle('completed',!!op?.completedStops?.includes(Number(n)));item.classList.toggle('current',!!current);item.classList.toggle('next',!current&&!!next);
  const order=document.createElement('div');order.className='arrival-order';order.textContent=n;
  const info=document.createElement('div');info.className='arrival-info';const name=document.createElement('div');name.className='arrival-name';name.textContent=p.name;info.appendChild(name);
  const timing=document.createElement('div');timing.className='arrival-time';
  const arrival=arrivals.find(a=>String(a.stop.feature.properties.stopNumber)===n);
  timing.textContent=current?(op.status==='PARKED'?'Parked at Stop':'Arriving at Stop'):next?(op.currentStop!==null?'Next stop - After departure':formatETA(arrival?.etaMinutes)):op?.completedStops?.includes(Number(n))?'Completed stop':'Later stop';
  item.append(order,info,timing);item.onclick=()=>{closeStopsPanel();followVan=false;map.setView(L.latLng(stop.feature.geometry.coordinates[1],stop.feature.geometry.coordinates[0]),16);stop.layer.openPopup();};container.appendChild(item);
 });
}
document.addEventListener('keydown',function(event){if(event.key==='Escape')closeStopsPanel();});
function updateStopPopups(arrivals){
 const op=getNormalizedLiveState();stopRecords.forEach(record=>{
  const arrival=(arrivals||[]).find(a=>String(a.stop.feature.properties.stopNumber)===String(record.feature.properties.stopNumber));
  const current=op&&String(op.currentStop)===String(record.feature.properties.stopNumber);
  record.layer.bindPopup(buildPointPopupHTML(record.feature.properties,arrival?.distanceKm??null,arrival?.etaMinutes??null,null,{atStop:current&&op.status==='PARKED',statusLabel:current?(op.status==='PARKED'?'Parked at Stop':'Arriving at Stop'):null}));
 });
}
