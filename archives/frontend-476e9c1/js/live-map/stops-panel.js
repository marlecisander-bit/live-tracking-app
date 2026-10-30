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
 const container=document.getElementById('stop-arrivals-list'),model=window.publicOperationalStatus;
 const old=new Map([...container.children].map(el=>[el.dataset.stopId,el])),used=new Set();let index=0;
 // Retain keyed buttons so a five-second freshness tick never steals keyboard focus.
 for(const node of [...container.childNodes])if(node.nodeType===3)node.remove();
 const records=stopRecords.slice().sort((a,b)=>Number(a.feature.properties.stopNumber)-Number(b.feature.properties.stopNumber));
 records.forEach(stop=>{
  const p=stop.feature.properties,id=String(p.objectId||p.stopNumber);if(used.has(id))return;used.add(id);
  const entry=model?.stopStatuses?.find(s=>s.id===String(p.objectId)),appearance=window.stopDesign.resolve(p),hex=appearance.color.slice(1);
  const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  let item=old.get(id);
  if(!item){item=document.createElement('button');item.type='button';item.className='arrival-item';item.dataset.stopId=id;
   const portrait=document.createElement('span'),info=document.createElement('div'),timing=document.createElement('div');
   portrait.className='arrival-portrait';info.className='arrival-name';timing.className='arrival-time';item.append(portrait,info,timing);
  }
  item.style.setProperty('--stop-color',appearance.color);item.style.setProperty('--stop-tint','rgba('+rgb.join(',')+',0.09)');
  item.classList.toggle('completed',!!entry?.completed);item.classList.toggle('current',!!entry?.current);item.classList.toggle('next',!entry?.current&&!!entry?.next);
  const portrait=window.stopDesign.portrait(p,false);
  if(item._portrait!==portrait){item.querySelector('.arrival-portrait').innerHTML=portrait;item._portrait=portrait;}
  item.querySelector('.arrival-name').textContent=p.name;
  item.querySelector('.arrival-time').textContent=entry?.label||'Route information updating';
  item.onclick=()=>{closeStopsPanel();followVan=false;map.setView(L.latLng(stop.feature.geometry.coordinates[1],stop.feature.geometry.coordinates[0]),16);stop.layer.openPopup();};
  if(container.children[index]!==item)container.insertBefore(item,container.children[index]||null);index++;
 });
 for(const [id,item] of old)if(!used.has(id))item.remove();
}
document.addEventListener('keydown',function(event){if(event.key==='Escape')closeStopsPanel();});
function updateStopPopups(){
 stopRecords.forEach(record=>{
  const html=buildPointPopupHTML(record.feature.properties);
  // setContent refreshes an already open popup as observations age.
  if(record.layer.getPopup())record.layer.setPopupContent(html);else record.layer.bindPopup(html);
 });
}

/* Keep modal keyboard focus inside the existing dismissible panel. */
document.getElementById('stops-panel').addEventListener('keydown',function(event){
 if(event.key!=='Tab')return;const items=[...this.querySelectorAll('button')].filter(el=>!el.disabled);
 if(!items.length)return;const first=items[0],last=items[items.length-1];
 if(event.shiftKey&&(document.activeElement===first||document.activeElement===this)){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
