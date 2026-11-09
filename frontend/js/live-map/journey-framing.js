/* Camera framing only: keep an accepted visible van clear of overlays while following. */
(function(root){let pending=0;
 function keepVehicleClear(){if(pending)return;pending=requestAnimationFrame(()=>{pending=0;
  if(typeof followVan==='undefined'||!followVan||typeof vanMarker==='undefined'||!vanMarker||!root.publicOperationalStatus?.markerVisible)return;
  if(typeof VAN_FOLLOW_ZOOM!=='undefined'&&map.getZoom()!==VAN_FOLLOW_ZOOM)map.setView(vanMarker.getLatLng(),VAN_FOLLOW_ZOOM,{animate:false});
  const app=document.getElementById('map').getBoundingClientRect();
  const short=app.height<=380;
  const left=short?52:48,top=48,right=48,bottom=48;
  if(app.width-right<=left||app.height-bottom<=top)return;
  map.panInside(vanMarker.getLatLng(),{paddingTopLeft:[left,top],paddingBottomRight:[right,bottom],animate:false});
 });}
 map.on('moveend',keepVehicleClear);root.journeyFraming={keepVehicleClear};
 window.addEventListener('pagehide',e=>{if(!e.persisted){cancelAnimationFrame(pending);map.off('moveend',keepVehicleClear);}});
})(window);
