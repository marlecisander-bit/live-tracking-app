/* Camera framing only: keep an accepted visible van clear of overlays while following. */
(function(root){let pending=0;
 function keepVehicleClear(){if(pending)return;pending=requestAnimationFrame(()=>{pending=0;
  if(typeof followVan==='undefined'||!followVan||typeof vanMarker==='undefined'||!vanMarker||!root.publicOperationalStatus?.markerVisible)return;
  if(typeof VAN_FOLLOW_ZOOM!=='undefined'&&map.getZoom()!==VAN_FOLLOW_ZOOM)map.setView(vanMarker.getLatLng(),VAN_FOLLOW_ZOOM,{animate:false});
  const app=document.getElementById('app').getBoundingClientRect(),card=document.getElementById('next-card').getBoundingClientRect(),dock=document.getElementById('map-controls').getBoundingClientRect();
  const narrow=app.width<768&&app.height>480,short=app.height<=380;
  const external=document.getElementById('app').dataset.websiteStatus==='external-v1';
  const left=short?52:48,top=external?48:narrow?card.bottom-app.top+48:short?130:48,right=external?48:narrow?48:app.right-card.left+48,bottom=app.bottom-dock.top+48;
  if(app.width-right<=left||app.height-bottom<=top)return;
  map.panInside(vanMarker.getLatLng(),{paddingTopLeft:[left,top],paddingBottomRight:[right,bottom],animate:false});
 });}
 map.on('moveend',keepVehicleClear);root.journeyFraming={keepVehicleClear};
 window.addEventListener('pagehide',e=>{if(!e.persisted){cancelAnimationFrame(pending);map.off('moveend',keepVehicleClear);}});
})(window);
