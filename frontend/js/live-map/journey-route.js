/* Static route decoration and conservative stop-to-stop progress. Never uses a GPS trail. */
(function(root){let group=null,last='',lastFeature=null;
 function render(model,view){
  if(typeof activeRouteFeature==='undefined'||!activeRouteFeature||typeof map==='undefined'||!(routeLengthKm>0))return;
  const signature=JSON.stringify([view.routeProgressVerified,view.stops.map(s=>[s.id,s.completed]),typeof currentPublishedId==='undefined'?null:currentPublishedId]);
  if(group&&signature===last&&lastFeature===activeRouteFeature)return;
  last=signature;lastFeature=activeRouteFeature;if(!group)group=L.layerGroup().addTo(map);else group.clearLayers();
  const color=window.mapContentSafety.color?window.mapContentSafety.color(routeProperties.color):routeProperties.color;
  const base=/^#[0-9a-f]{6}$/i.test(color||'')?color:'#d90000';
  if(typeof operationalLegs!=='undefined')for(const leg of operationalLegs){
   const a=view.stops.find(s=>s.id===String(leg.from.feature.properties.objectId)),b=view.stops.find(s=>s.id===String(leg.to.feature.properties.objectId));
   const complete=view.routeProgressVerified&&a?.completed&&b?.completed&&!['next','approaching'].includes(b?.viewState);
   let from=leg.from.locationKm,to=leg.to.locationKm;if(!Number.isFinite(from)||!Number.isFinite(to))continue;
   const spans=to>=from?[[from,to]]:[[from,routeLengthKm],[0,to]];
   for(const [start,end] of spans){if(end-start<.001)continue;try{L.geoJSON(turf.lineSliceAlong(activeRouteFeature,start,end,{units:'kilometers'}),{interactive:false,style:{color:complete?'#197b51':base,weight:complete?7:5,opacity:complete?.85:.7,lineCap:'round',dashArray:null}}).addTo(group);}catch{}}
  }
  if(routeProperties.directionMode!=='twoway')for(let i=1;i<=7;i++){const km=routeLengthKm*i/8;
   try{const point=turf.along(activeRouteFeature,km,{units:'kilometers'}),next=turf.along(activeRouteFeature,Math.min(km+.025,routeLengthKm),{units:'kilometers'}),bearing=turf.bearing(point,next);
    L.marker([point.geometry.coordinates[1],point.geometry.coordinates[0]],{interactive:false,keyboard:false,icon:L.divIcon({className:'route-direction',html:'<svg viewBox="0 0 20 20" aria-hidden="true" style="transform:rotate('+bearing+'deg)"><path d="m5 13 5-6 5 6"/></svg>',iconSize:[20,20],iconAnchor:[10,10]}),zIndexOffset:-100}).addTo(group);
   }catch{}
  }
 }
 root.journeyRoute={render};
})(window);
