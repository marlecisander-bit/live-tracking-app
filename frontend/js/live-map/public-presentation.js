/* Presentation only: consumes resolved status and the existing freshness classifier. */
(function(root) {
    var locationUnavailable=false;
    function refresh(status) {
        var card=document.getElementById('next-card');if(!card)return;
        if(typeof vehicleStopState!=='undefined'&&vehicleStopState&&vehicleStopState.operational_state?.version!==3){
            card.className='unknown';card.dataset.layout='loading';card.dataset.eta='false';card.dataset.distance='false';
            var live = document.getElementById('operational-live'), badge = document.getElementById('operational-stop-badge');
            if (live) live.hidden = true;
            if (badge) badge.hidden = true;
            document.getElementById('next-label').innerText='LIVE TRACKING';
            document.getElementById('next-stop-name').innerText='--';
            document.getElementById('van-movement-status').innerText='Tracking is being updated. Please try again shortly.';
            document.getElementById('eta-value').innerText='--';
            document.getElementById('tourist-location-warning').hidden=true;
            if(typeof stopRecords!=='undefined')stopRecords.forEach(function(record){var element=record.layer?.getElement?.();element?.classList.remove('tourist-current-stop','tourist-next-stop');});
            return;
        }
        var name=document.getElementById('next-stop-name').innerText.trim();
        var eta=document.getElementById('eta-value').innerText.trim();
        var distance=document.getElementById('next-stop-distance').innerText.trim();
        var approaching=card.classList.contains('arriving'),atStop=card.classList.contains('parked'),stationary=card.classList.contains('stationary');
        var hasDestination=!!name&&!/^(--|Calculating.*|undefined|NaN)$/.test(name);
        card.dataset.layout=(atStop||approaching)?'stop':stationary?'stationary':hasDestination?'moving':'loading';
        card.dataset.eta=String(!!eta&&!/^(--|0 min|NaN.*|undefined)$/.test(eta));
        card.dataset.distance=String(!!distance&&!/^(--.*|NaN.*|undefined)$/.test(distance));
        document.getElementById('next-label').innerText=approaching?'ARRIVING AT STOP':atStop?'PARKED AT STOP':stationary?'STOPPED':hasDestination?'NEXT STOP':'FINDING THE VAN';
        document.getElementById('next-destination-label').innerText='Next:';
        if(!hasDestination&&!atStop&&!approaching&&!stationary)document.getElementById('van-movement-status').innerText='Locating van...';
        var warning=document.getElementById('tourist-location-warning');
        var p=typeof canonicalLivePosition==='undefined'?null:canonicalLivePosition;
        var arrival=typeof publicUiArrival==='undefined'?null:publicUiArrival;
        var state=root.trackingState.describe(p,{atStop:atStop,approaching:approaching,
            stationary:arrival?.stationary,locationState:arrival?.locationState,unavailable:locationUnavailable,
            quality:typeof publicGpsQuality==='undefined'?null:publicGpsQuality});
        var offline=state.health==='OFFLINE';
        card.dataset.trackingHealth=state.health;
        card.dataset.movement=state.movement;
        card.dataset.location=state.location;
        card.dataset.oldLocation=String(!atStop&&(state.health!=='LIVE'&&!state.parkedQuiet));
        if(approaching&&state.health!=='LIVE')document.getElementById('next-label').innerText='LAST SEEN AT';
        var unavailable=state.health!=='LIVE'&&!state.parkedQuiet;
        warning.hidden=!unavailable;
        if(unavailable){var age=state.ageSeconds*1000;warning.textContent=(offline?'Live tracking temporarily unavailable':'Updating location')+(Number.isFinite(age)&&age>=0?' - Last update '+formatGPSAge(age).replace(/m$/, ' min').replace(/s$/, ' sec')+' ago':'');}
        if(offline&&!hasDestination&&!atStop&&!stationary){
            document.getElementById('next-label').innerText='VAN LOCATION';
            document.getElementById('van-movement-status').innerText='Location temporarily unavailable';
            warning.hidden=true;
        }
        // Project authoritative status only. Freshness thresholds remain in trackingState.
        var resolved = status || root.publicOperationalStatus;
        var fresh = state.health === 'LIVE';
        var badge = document.getElementById('operational-stop-badge');
        var live = document.getElementById('operational-live');
        if (live) live.hidden = !fresh;
        if (badge) {
            badge.hidden = !(fresh && atStop && resolved?.currentStop);
            badge.textContent = resolved?.currentStop?.number || '';
        }
        card.dataset.eta = String(fresh && card.dataset.eta === 'true');
        if (!fresh) {
            document.getElementById('next-destination-label').innerText = 'Last destination:';
            document.getElementById('van-movement-status').innerText = p ? 'Last known route position' : 'Location unavailable';
            document.getElementById('next-label').innerText = offline ? 'TRACKING OFFLINE' : 'LAST KNOWN POSITION';
            if (atStop || approaching) document.getElementById('van-movement-status').innerText =
                'Last seen at ' + (resolved?.currentStop?.name || resolved?.nextStop?.name || 'a stop');
            warning.hidden = false;
            warning.textContent = (offline ? 'Live tracking unavailable' : 'Location update delayed') +
                (Number.isFinite(state.ageSeconds) && state.ageSeconds >= 0 ? ' · Last update ' + formatGPSAge(state.ageSeconds * 1000) + ' ago' : '');
        } else if (resolved) {
            var current = resolved.currentStop, next = resolved.nextStop;
            document.getElementById('next-label').innerText = atStop ? 'PARKED AT STOP ' + (current?.number || '') : approaching ? 'ARRIVING AT STOP' : stationary ? 'VAN STOPPED' : 'VAN ON ROUTE';
            if (atStop && current) document.getElementById('van-movement-status').innerText = current.name;
            if (!atStop && !approaching && !stationary && next) document.getElementById('van-movement-status').innerText = 'Heading to Stop ' + next.number;
            if (next) document.getElementById('next-stop-name').innerText = (atStop ? 'Stop ' + next.number + ' · ' : '') + next.name;
        }
        // Reuse the resolved card status; do not perform another stop/radius test.
        if(status&&typeof stopRecords!=='undefined')stopRecords.forEach(function(record){
            var element=record.layer&&record.layer.getElement&&record.layer.getElement();if(!element)return;
            var number=String(record.feature.properties.stopNumber);
            var current=fresh&&(atStop||approaching)&&status.currentStop&&number===String(status.currentStop.number);
            var next=status.nextStop&&number===String(status.nextStop.number);
            element.classList.toggle('tourist-current-stop',!!current);element.classList.toggle('tourist-next-stop',!current&&!!next);
            element.setAttribute('aria-label',record.feature.properties.name+(current?' - van at stop':next?' - next stop':''));
        });
    }
    root.publicPresentation={refresh:refresh,setLocationUnavailable:function(value){locationUnavailable=!!value;refresh();}};
})(window);

/* Install in the independent map AFTER its existing public presentation scripts.
 * Read-only: relays rendered public status, never coordinates or GPS calculations.
 * Parent initiates the handshake, so no message is sent to an unknown origin.
 */
(function () {
  const allowed = new Set(window.appConfig.allowedParentOrigins || []);
  let parentOrigin = null;
  function send() {
    if (window.sendJourneyPresentation) window.sendJourneyPresentation();
    if (!parentOrigin) return;
    const card = document.getElementById('next-card');
    if (!card) return;
    const text = id => (document.getElementById(id)?.innerText || '').trim().slice(0, 180);
    const warning=document.getElementById('tourist-location-warning');
    window.parent.postMessage({type:'shkodra:public-status',version:1,label:text('next-label'),name:text('next-stop-name'),movement:warning&&!warning.hidden?warning.innerText.trim().slice(0,180):text('van-movement-status'),unavailable:!!warning&&!warning.hidden},parentOrigin);
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !allowed.has(event.origin) || event.data?.type !== 'shkodra:request-status') return;
    parentOrigin = event.origin; send();
  });
  const card=document.getElementById('next-card');
  if (card) new MutationObserver(send).observe(card,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});
  // Heartbeat reuses presentation only; it does not query any service.
  setInterval(send,15000);
})();

/* Website journey bridge: projects resolved operational state, never polls GPS. */
(function(){
 const allowed=new Set([...(window.appConfig.allowedParentOrigins||[]),'https://sightseeingapp.netlify.app']);let parentOrigin=null;
 window.sendJourneyPresentation=function(){
  if(!parentOrigin)return;
  const op=typeof getNormalizedLiveState==='function'?getNormalizedLiveState():null;
  const card=document.getElementById('next-card');
  const warning=document.getElementById('tourist-location-warning');
  const unavailable=!op||!card||card.dataset.oldLocation==='true'||!!warning&&!warning.hidden;
  const records=typeof operationalSequence!=='undefined'?operationalSequence:[];
  const seen=new Set();
  const stops=records.filter(r=>{const p=r.feature?.properties;if(!p||p.active===false||!p.objectId||seen.has(p.objectId))return false;seen.add(p.objectId);return true;}).map(r=>{
   const p=r.feature.properties,n=String(p.stopNumber);
   const state=op?.completedStops?.includes(Number(n))&&n!==String(op.currentStop)?'departed':unavailable?'upcoming':op.currentStop!=null&&n===String(op.currentStop)?'current':op.nextStop!=null&&n===String(op.nextStop)?'next':op.completedStops?.includes(Number(n))?'departed':'upcoming';
   const eta=state==='next'&&card.dataset.eta==='true'?(document.getElementById('eta-value')?.innerText||''):'';
   return {id:String(p.objectId||''),number:n,label:String(p.name||'Stop').slice(0,180),state,eta:eta.slice(0,80)};
  }).filter(s=>s.id);
  window.parent.postMessage({type:'shkodra:journey',version:1,unavailable,stops},parentOrigin);
 };
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||!allowed.has(event.origin))return;
  if(event.data?.type==='shkodra:request-journey'){parentOrigin=event.origin;window.sendJourneyPresentation();}
  if(event.data?.type==='shkodra:select-stop'&&typeof event.data.id==='string'){
   const records=typeof stopRecords!=='undefined'?stopRecords:[];
   const record=records.find(r=>r.feature?.properties?.objectId===event.data.id&&r.feature.properties.active!==false);
   if(record?.layer){map.panTo(record.layer.getLatLng());record.layer.openPopup();}
  }
 });
})();
