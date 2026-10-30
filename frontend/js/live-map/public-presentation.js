/* A single presentation owner for card, marker and both version-1 website bridges. */
(function(root){
    let model=null, statusOrigin=null, journeyOrigin=null, lastAnnouncement='';
    const allowed=new Set(root.appConfig.allowedParentOrigins||[]);
    const journeyAllowed=new Set([...allowed,'https://sightseeingapp.netlify.app']);
    function text(id,value){const el=document.getElementById(id);if(el&&el.textContent!==String(value??''))el.textContent=value??'';}
    function send(){
        if(!model)return;
        const confidence={activity:model.activityConfidence,position:model.positionFreshness,eta:model.etaConfidence};
        if(statusOrigin)root.parent.postMessage({type:'shkodra:public-status',version:1,label:model.gps==='live'?'Live location':model.passengerState==='last_seen'?'Last seen':'Location unavailable',
            name:model.currentStop?.name||model.nextConfirmedStop?.name||'',movement:model.message,unavailable:model.gps!=='live',
            passengerState:model.passengerState,confidence,lastObservationAt:model.lastObservationAt},statusOrigin);
        if(journeyOrigin)root.parent.postMessage({type:'shkodra:journey',version:1,unavailable:(model.gps!=='live'||!model.coherent)&&!model.parkingVerified,
            movement:model.message,passengerState:model.passengerState,confidence,progressKnown:model.progressKnown,lastObservationAt:model.lastObservationAt,
            stops:model.stopStatuses.map(s=>({id:s.id,number:s.number,label:s.name,state:s.bridgeState,eta:s.eta,statusText:s.label,historical:model.locationHistorical}))},journeyOrigin);
    }
    function render(next){
        model=next;
        const card=document.getElementById('next-card');if(!card)return;
        card.dataset.layout='tourist';card.dataset.trackingHealth=model.gps.toUpperCase();
        card.dataset.eta=String(model.etaConfidence==='valid');card.dataset.oldLocation=String(model.locationHistorical);
        card.dataset.activity=model.activity;card.dataset.service=model.service;card.dataset.state=model.passengerState;card.dataset.tone=model.markerTone;
        text('operational-live',model.gps==='live'?'Live':model.passengerState==='last_seen'?'Last report':'Tracking');
        document.getElementById('operational-live').hidden=false;
        document.getElementById('operational-stop-badge').hidden=true;
        text('van-message-label','');
        if(lastAnnouncement!==model.message){text('van-movement-status',model.message);lastAnnouncement=model.message;}
        text('next-destination-label','');text('next-stop-name',model.secondary);
        text('eta-value',model.timing);text('eta-unavailable','');text('next-stop-distance','');
        document.getElementById('next-meta').hidden=!model.timing;document.getElementById('next-destination-row').hidden=!model.secondary;
        text('tourist-service-note','');text('tourist-schedule-details',model.serviceMessage);
        const observed=document.getElementById('tourist-observation');
        observed.textContent=model.lastObservationAt?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Tirane',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(model.lastObservationAt))+' (Shkodra time)':'Not yet available';
        if(model.lastObservationAt)observed.setAttribute('datetime',model.lastObservationAt);else observed.removeAttribute('datetime');
        text('tourist-progress',model.progressText);
        text('tourist-activity-confidence',model.activityConfidence==='confirmed'?'Confirmed':model.activityConfidence==='historical'?'Previously observed':'Not yet confirmed');
        text('tourist-position-confidence',model.gps==='live'?'Fresh observation':model.gps==='delayed'?'Last known position':'Out of date or unavailable');
        text('tourist-eta-confidence',model.etaConfidence==='valid'?'Current estimate':model.etaConfidence==='outdated'?'Expired · not shown':'Not shown');
        text('tourist-next-destination',model.nextConfirmedStop?'Next destination · '+model.nextConfirmedStop.name:'Next destination not yet confirmed');
        const view=root.touristView.project(model);card.dataset.state=model.passengerState;card.dataset.displayState=view.presentationState;
        text('journey-context',view.label);text('journey-destination',view.destination);text('journey-activity',view.activity);text('journey-eta',view.eta);
        document.getElementById('journey-facts').hidden=!view.activity&&!view.eta;document.getElementById('journey-activity-row').hidden=!view.activity;document.getElementById('journey-eta-row').hidden=!view.eta;
        const badge=document.getElementById('operational-live');badge.hidden=!view.live;badge.textContent='LIVE';
        const timeline=document.getElementById('tourist-timeline');timeline.hidden=view.stops.length!==5;
        const old=new Map([...timeline.children].map(el=>[el.dataset.stopId,el]));let index=0;
        for(const stop of view.stops){let item=old.get(stop.id);if(!item){item=document.createElement('li');item.dataset.stopId=stop.id;const button=document.createElement('button');button.type='button';button.innerHTML='<span class="journey-circle" aria-hidden="true"></span><span class="journey-stop-name"></span>';item.append(button);button.addEventListener('click',()=>root.selectJourneyStop(item.dataset.stopId));}
          item.dataset.state=stop.viewState;item.classList.toggle('leg-completed',view.routeProgressVerified&&index>0&&view.stops[index-1].completed&&stop.completed&&!['next','approaching'].includes(stop.viewState));
          const button=item.firstElementChild;button.setAttribute('aria-label','Stop '+stop.number+' · '+stop.name+' · '+stop.label);button.title=stop.name;const circle=button.querySelector('.journey-circle'),name=button.querySelector('.journey-stop-name'),symbol=stop.viewState==='completed'?'✓':stop.number;if(circle.textContent!==symbol)circle.textContent=symbol;if(name.textContent!==stop.name)name.textContent=stop.name;
          if(stop.current||stop.next)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
          if(timeline.children[index]!==item)timeline.insertBefore(item,timeline.children[index]||null);index++;old.delete(stop.id);
        }for(const item of old.values())item.remove();
        root.journeyRoute?.render(model,view);

        const warning=document.getElementById('tourist-location-warning');warning.hidden=true;text('tourist-location-warning','');
        text('live-badge-text',model.message);
        if(typeof vanMarker!=='undefined' && vanMarker){
            vanMarker.setOpacity(model.markerVisible?1:0);
            const element=vanMarker.getElement();if(element){element.classList.toggle('tourist-last-seen',model.locationHistorical);element.classList.toggle('journey-position-fresh',model.gps==='live'&&model.markerVisible);element.dataset.journeyState=model.passengerState;element.dataset.journeyTone=model.markerTone;element.setAttribute('aria-label',model.message+(model.lastObservationAt?' · '+observed.textContent:''));}
            if(model.gps!=='live' && typeof publicMarkerController!=='undefined')publicMarkerController?.stop();
            if(model.locationHistorical&&model.markerVisible&&root.canonicalLivePosition)vanMarker.setLatLng([root.canonicalLivePosition.latitude,root.canonicalLivePosition.longitude]);
        }
        if(typeof stopRecords!=='undefined')stopRecords.forEach(r=>{
            const s=model.stopStatuses.find(s=>s.id===String(r.feature.properties.objectId)),el=r.layer?.getElement?.();
            if(!el||!s)return;el.classList.toggle('tourist-current-stop',s.current);el.classList.toggle('tourist-next-stop',s.next);el.dataset.journeyState=view.stops.find(x=>x.id===s.id)?.viewState||'unknown';
            el.setAttribute('aria-label','Stop '+s.number+' · '+s.name+' · '+s.label);
        });
        send();
    }
    root.publicPresentation={locationUnavailable:false,render,refresh:function(){if(typeof updateSmartRouteInformation==='function')updateSmartRouteInformation();},
        setLocationUnavailable(value){this.locationUnavailable=!!value;}};
    root.selectJourneyStop=function(id){const r=stopRecords.find(r=>String(r.feature.properties.objectId)===String(id));if(r?.layer){followVan=false;map.panTo(r.layer.getLatLng());r.layer.openPopup();}};
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
