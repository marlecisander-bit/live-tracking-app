/* Zoom/collision presentation only. Never changes features, coordinates or tracking. */
(function(){
 let frame=0,selected=null;
 function schedule(){if(!frame)frame=requestAnimationFrame(layout);}
 function layout(){
  frame=0;const records=typeof stopRecords==='undefined'?[]:stopRecords;
  const points=records.filter(r=>r.layer?.getElement()).map(r=>({r,point:map.latLngToContainerPoint(r.layer.getLatLng())}));
  points.sort((a,b)=>(b.r.layer===selected)-(a.r.layer===selected)||Number(a.r.feature.properties.stopNumber)-Number(b.r.feature.properties.stopNumber));
  const used=[];const container=map.getContainer().getBoundingClientRect();const van=document.querySelector('.van-marker-wrap')?.getBoundingClientRect();
  points.forEach(({r,point})=>{
   const nearVan=van&&Math.abs(point.x-(van.x+van.width/2-container.x))<95&&Math.abs(point.y-(van.y+van.height/2-container.y))<85;
   const full=r.layer===selected||(map.getZoom()>=13&&!nearVan&&!used.some(p=>Math.abs(p.x-point.x)<144&&Math.abs(p.y-point.y)<112));
   const element=r.layer.getElement();element.classList.toggle('stop-photo-compact',!full);
   element.setAttribute('aria-label','Stop '+r.feature.properties.stopNumber+' · '+r.feature.properties.name);
   r.layer.setZIndexOffset(r.layer===selected?500:0);if(full)used.push(point);
  });
 }
 function added(e){if(e.layer instanceof L.Marker)e.layer.on('move',schedule);schedule();}
 function removed(e){if(e.layer instanceof L.Marker)e.layer.off('move',schedule);schedule();}
 map.on('zoomend moveend',schedule);
 map.on('layeradd',added);map.on('layerremove',removed);
 map.eachLayer(layer=>{if(layer instanceof L.Marker)layer.on('move',schedule);});
 map.on('popupopen',e=>{selected=(typeof stopRecords==='undefined'?[]:stopRecords).find(r=>r.layer.getPopup()===e.popup)?.layer;schedule();});
 map.on('popupclose',()=>{selected=null;schedule();});
 window.stopMarkerLayout={refresh:schedule};
 window.addEventListener('pagehide',e=>{if(!e.persisted){cancelAnimationFrame(frame);map.off('zoomend moveend',schedule);map.off('layeradd',added);map.off('layerremove',removed);map.eachLayer(layer=>{if(layer instanceof L.Marker)layer.off('move',schedule);});}});
 schedule();
})();
