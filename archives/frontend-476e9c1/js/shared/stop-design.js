/* Single presentation adapter for persisted GeoJSON stop content. No IO. */
(function(root) {
 const esc = value => root.mapContentSafety.escape(value);
 function color(value) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#F20544'; }
 function photoURL(value) {
  if(typeof value !== 'string' || value.length > 2048) return '';
  try { const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password ? u.href : ''; } catch { return ''; }
 }
 function resolve(p) {
  p=p||{};const defaults=root.stopDesignDefaults?.[p.objectId]||{};
  return {number:String(p.stopNumber??'S'),name:String(p.name||'Unnamed stop'),
   color:color(p.color||defaults.color),photoUrl:photoURL(Object.hasOwn(p,'photoUrl')?p.photoUrl:defaults.photoUrl)};
 }
 function portrait(p, label) {
  const a=resolve(p), image=a.photoUrl?'<img class="stop-photo" src="'+esc(a.photoUrl)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'';
  return '<span class="stop-portrait'+(!image?' is-photo-missing':'')+'" style="--stop-color:'+a.color+'">'+
   '<span class="stop-photo-frame">'+image+'<span class="stop-photo-fallback">Photo unavailable</span></span>'+
   '<span class="stop-number-badge">'+esc(a.number)+'</span>'+
   (label?'<span class="stop-name-pill">'+esc(a.name)+'</span>':'')+'</span>';
 }
 function icon(p) {
  const a=resolve(p);return L.divIcon({className:'stop-photo-marker',
   html:'<span class="stop-marker-shell" aria-hidden="true">'+portrait(p,true)+'<span class="stop-compact" style="--stop-color:'+a.color+'">'+esc(a.number)+'</span></span>',
   iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-38]});
 }
 document.addEventListener('error',function(event){const img=event.target;if(img?.classList?.contains('stop-photo')){img.hidden=true;img.closest('.stop-portrait')?.classList.add('is-photo-missing');}},true);
 root.stopDesign={resolve,color,photoURL,portrait,icon};
})(window);
