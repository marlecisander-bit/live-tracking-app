/* Layout only. Leader lines retain the true geographic anchor; no setLatLng or feature mutation. */
(function(){let frame=0,selected=null;function schedule(){if(!frame)frame=requestAnimationFrame(layout)}
 function layout(){frame=0;const records=typeof stopRecords==='undefined'?[]:stopRecords,container=map.getContainer().getBoundingClientRect(),van=document.querySelector('#map .van-marker-wrap .vehicle-symbol')?.getBoundingClientRect(),used=[],labels=[];
 function priority(r){if(r.layer===selected)return 3;const s=window.publicOperationalStatus?.stopStatuses.find(s=>s.id===String(r.feature.properties.objectId));return s?.current||s?.next?2:0;}
 const points=records.filter(r=>r.layer?.getElement()).map(r=>({r,p:map.latLngToContainerPoint(r.layer.getLatLng())}));points.sort((a,b)=>priority(b.r)-priority(a.r)||Number(a.r.feature.properties.stopNumber)-Number(b.r.feature.properties.stopNumber));
 for(const {r,p} of points){const el=r.layer.getElement(),near=van&&Math.abs(p.x-(van.x+van.width/2-container.x))<95&&Math.abs(p.y-(van.y+van.height/2-container.y))<85;
  const candidates=[[0,0],[-45,-12],[45,-12],[0,-48],[-45,-48],[45,-48],[-45,28],[45,28],[0,48]];
  const shift=candidates.find(([dx,dy])=>p.x+dx>=24&&p.x+dx<=container.width-24&&p.y+dy>=50&&p.y+dy<=container.height-10&&!used.some(q=>Math.hypot(q.x-(p.x+dx),q.y-(p.y+dy))<45))||[0,0];
  const visual={x:p.x+shift[0],y:p.y+shift[1]};used.push(visual);el.style.setProperty('--pin-dx',shift[0]+'px');el.style.setProperty('--pin-dy',shift[1]+'px');
  const leader=el.querySelector('.stop-leader line');if(leader){leader.setAttribute('x2',String(24+shift[0]));leader.setAttribute('y2',String(48+shift[1]-(near?14:0)));}
  const full=r.layer===selected||(map.getZoom()>=11&&!near&&!labels.some(q=>Math.abs(q.x-visual.x)<145&&Math.abs(q.y-visual.y)<60));el.classList.toggle('stop-pin-compact',!full);el.classList.toggle('stop-selected',r.layer===selected);el.classList.toggle('stop-near-van',!!near);if(full)labels.push(visual);
  const status=window.publicOperationalStatus?.stopStatuses.find(s=>s.id===String(r.feature.properties.objectId));el.setAttribute('aria-label','Stop '+r.feature.properties.stopNumber+' · '+r.feature.properties.name+(status?' · '+status.label:''));r.layer.setZIndexOffset(r.layer===selected?600:priority(r)*100);
 }
 }
 function added(e){if(e.layer instanceof L.Marker)e.layer.on('move',schedule);schedule()}function removed(e){if(e.layer instanceof L.Marker)e.layer.off('move',schedule);schedule()}
 map.on('zoomend moveend',schedule);map.on('layeradd',added);map.on('layerremove',removed);map.eachLayer(l=>{if(l instanceof L.Marker)l.on('move',schedule)});
 map.on('popupopen',e=>{selected=stopRecords.find(r=>r.layer.getPopup()===e.popup)?.layer;schedule()});map.on('popupclose',()=>{selected=null;schedule()});window.stopMarkerLayout={refresh:schedule};
 window.addEventListener('pagehide',e=>{if(!e.persisted){cancelAnimationFrame(frame);map.off('zoomend moveend',schedule);map.off('layeradd',added);map.off('layerremove',removed);map.eachLayer(l=>{if(l instanceof L.Marker)l.off('move',schedule)})}});schedule();
})();
