/* A single presentation owner for card, marker and both version-1 website bridges. */
(function(root){
    let model=null, statusOrigin=null, journeyOrigin=null, lastAnnouncement='';
    const allowed=new Set(root.appConfig.allowedParentOrigins||[]);
    const journeyAllowed=new Set([...allowed,'https://sightseeingapp.netlify.app']);
    function text(id,value){const el=document.getElementById(id);if(el)el.textContent=value;}
    function send(){
        if(!model)return;
        if(statusOrigin)root.parent.postMessage({type:'shkodra:public-status',version:1,label:model.gps==='live'?'Live location':model.gps==='delayed'?'Location delayed':'Location unavailable',
            name:model.currentStop?.name||model.nextStop?.name||'',movement:model.message,unavailable:model.gps!=='live'||!model.coherent},statusOrigin);
        if(journeyOrigin)root.parent.postMessage({type:'shkodra:journey',version:1,unavailable:model.gps!=='live'||!model.coherent,
            stops:model.stopStatuses.map(s=>({id:s.id,number:s.number,label:s.name,state:s.bridgeState,eta:s.eta}))},journeyOrigin);
    }
    function render(next){
        model=next;
        const card=document.getElementById('next-card');if(!card)return;
        card.dataset.layout='tourist';card.dataset.trackingHealth=model.gps.toUpperCase();
        card.dataset.eta=String(model.etaConfidence==='valid');card.dataset.oldLocation=String(model.locationHistorical);
        card.dataset.activity=model.activity;card.dataset.service=model.service;
        text('next-label','Sightseeing Shkodra');text('operational-live',model.gps==='live'?'Live':model.gps==='delayed'?'Delayed':'Unavailable');
        document.getElementById('operational-live').hidden=false;
        document.getElementById('operational-stop-badge').hidden=true;
        text('van-message-label','');
        if(lastAnnouncement!==model.message){text('van-movement-status',model.message);lastAnnouncement=model.message;}
        text('next-destination-label','');text('next-stop-name',model.secondary);
        text('eta-value',model.timing);text('eta-unavailable','');text('next-stop-distance','');
        text('tourist-service-note',model.serviceMessage && model.serviceMessage!==model.message?model.serviceMessage:'');
        const observed=document.getElementById('tourist-observation');
        observed.textContent=model.lastObservationAt?'Last GPS observation · '+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Tirane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(model.lastObservationAt))+' (Shkodra time)':'Last GPS observation unavailable';
        if(model.lastObservationAt)observed.setAttribute('datetime',model.lastObservationAt);else observed.removeAttribute('datetime');
        text('tourist-progress',model.progressText);
        const warning=document.getElementById('tourist-location-warning');warning.hidden=true;text('tourist-location-warning','');
        text('live-badge-text',model.message);
        if(typeof vanMarker!=='undefined' && vanMarker){
            vanMarker.setOpacity(model.positionValid?1:0);
            const element=vanMarker.getElement();if(element){element.classList.toggle('tourist-last-seen',model.locationHistorical);element.setAttribute('aria-label',model.message+(model.lastObservationAt?' · '+observed.textContent:''));}
            if(model.locationHistorical && typeof publicMarkerController!=='undefined')publicMarkerController?.stop();
        }
        if(typeof stopRecords!=='undefined')stopRecords.forEach(r=>{
            const s=model.stopStatuses.find(s=>s.id===String(r.feature.properties.objectId)),el=r.layer?.getElement?.();
            if(!el||!s)return;el.classList.toggle('tourist-current-stop',s.current);el.classList.toggle('tourist-next-stop',s.next);
            el.setAttribute('aria-label',s.name+' · '+s.label);
        });
        send();
    }
    root.publicPresentation={locationUnavailable:false,render,refresh:function(){if(typeof updateSmartRouteInformation==='function')updateSmartRouteInformation();},
        setLocationUnavailable(value){this.locationUnavailable=!!value;}};
    root.sendJourneyPresentation=send;
    root.addEventListener('message',event=>{
        if(event.source!==root.parent||!journeyAllowed.has(event.origin))return;
        if(event.data?.type==='shkodra:request-status'&&allowed.has(event.origin)){statusOrigin=event.origin;send();}
        if(event.data?.type==='shkodra:request-journey'){journeyOrigin=event.origin;send();}
        if(event.data?.type==='shkodra:select-stop'&&typeof event.data.id==='string'){
            const r=stopRecords.find(r=>r.feature.properties.objectId===event.data.id&&r.feature.properties.active!==false);
            if(r?.layer){map.panTo(r.layer.getLatLng());r.layer.openPopup();}
        }
    });
})(window);
