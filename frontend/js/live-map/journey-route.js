/* Static route decoration and conservative stop-to-stop progress. Never uses a GPS trail. */
(function(root){let group=null,last='',lastFeature=null;
 function render(model,view){
  if(typeof activeRouteFeature==='undefined'||!activeRouteFeature||typeof map==='undefined'||!(routeLengthKm>0))return;
  const signature=JSON.stringify([view.routeProgressVerified,view.stops.map(s=>[s.id,s.completed]),typeof currentPublishedId==='undefined'?null:currentPublishedId]);
  if(group&&signature===last&&lastFeature===activeRouteFeature)return;
  last=signature;lastFeature=activeRouteFeature;if(!group)group=L.layerGroup().addTo(map);else group.clearLayers();
  // Preserve the original configured route stroke; progress belongs to the stop chart.
  if(typeof sightseeingLayers!=='undefined')sightseeingLayers.eachLayer(layer=>{
   if(layer.feature?.properties?.objectType==='route'&&layer.setStyle)layer.setStyle({opacity:.92});
  });
  if(routeProperties.directionMode!=='twoway')for(let i=1;i<=7;i++){const km=routeLengthKm*i/8;
   try{const point=turf.along(activeRouteFeature,km,{units:'kilometers'}),next=turf.along(activeRouteFeature,Math.min(km+.025,routeLengthKm),{units:'kilometers'}),bearing=turf.bearing(point,next);
    L.marker([point.geometry.coordinates[1],point.geometry.coordinates[0]],{interactive:false,keyboard:false,icon:L.divIcon({className:'route-direction',html:'<svg viewBox="0 0 20 20" aria-hidden="true" style="transform:rotate('+bearing+'deg)"><path d="m5 13 5-6 5 6"/></svg>',iconSize:[20,20],iconAnchor:[10,10]}),zIndexOffset:-100}).addTo(group);
   }catch{}
  }
 }
 root.journeyRoute={render};
})(window);
