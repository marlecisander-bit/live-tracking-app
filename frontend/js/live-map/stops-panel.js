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
 const fresh=document.getElementById('next-card').dataset.trackingHealth==='LIVE';
 const records=op?op.stopOrder.map(findStopRecordByNumber).filter(Boolean):stopRecords.slice().sort((a,b)=>Number(a.feature.properties.stopNumber)-Number(b.feature.properties.stopNumber));
 const seen=new Set();
 records.forEach(stop=>{
  const p=stop.feature.properties;if(seen.has(p.objectId||stop))return;seen.add(p.objectId||stop);
  const n=String(p.stopNumber),current=fresh&&op&&String(op.currentStop)===n,next=fresh&&op&&String(op.nextStop)===n;
  const appearance=window.stopDesign.resolve(p),hex=appearance.color.slice(1);
  const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  const item=document.createElement('button');item.type='button';item.className='arrival-item';
  item.style.setProperty('--stop-color',appearance.color);item.style.setProperty('--stop-tint','rgba('+rgb.join(',')+',0.09)');
  item.classList.toggle('completed',!!op?.completedStops?.includes(Number(n)));item.classList.toggle('current',!!current);item.classList.toggle('next',!current&&!!next);
  const portrait=document.createElement('span');portrait.innerHTML=window.stopDesign.portrait(p,false);
  const info=document.createElement('div');info.className='arrival-name';info.textContent=p.name;
  const timing=document.createElement('div');timing.className='arrival-time';
  const arrival=arrivals.find(a=>String(a.stop.feature.properties.stopNumber)===n);
  const eta=arrival?.etaMinutes;
  timing.textContent=!fresh?'Live arrivals unavailable':current?(op.status==='PARKED'?'Parked at stop':'Arriving at stop'):op?.completedStops?.includes(Number(n))?'Completed stop':next?'Next stop':'Upcoming stop';
  if(fresh&&!current&&eta!=null&&Number.isFinite(Number(eta))&&Number(eta)>=0) timing.textContent+=' · ETA: '+formatETA(eta);
  item.append(portrait,info,timing);item.onclick=()=>{closeStopsPanel();followVan=false;map.setView(L.latLng(stop.feature.geometry.coordinates[1],stop.feature.geometry.coordinates[0]),16);stop.layer.openPopup();};container.appendChild(item);
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

/* Keep modal keyboard focus inside the existing dismissible panel. */
document.getElementById('stops-panel').addEventListener('keydown',function(event){
 if(event.key!=='Tab')return;const items=[...this.querySelectorAll('button')].filter(el=>!el.disabled);
 if(!items.length)return;const first=items[0],last=items[items.length-1];
 if(event.shiftKey&&(document.activeElement===first||document.activeElement===this)){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
