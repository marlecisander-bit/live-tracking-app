/* Presentation/navigation only. Existing map, permissions and save actions remain authoritative. */
(function(){
 'use strict';
 const workspace=document.getElementById('workspace'),nav=document.getElementById('app-nav'),mapArea=document.getElementById('map-area'),sidebar=document.getElementById('sidebar'),editor=document.getElementById('editor');
 if(!workspace||!window.adminIcon)return;
 const pages={overview:['Overview','layout-dashboard'],map:['Live map','map'],stops:['Stops','map-pin'],routes:['Route','bus-front'],more:['More','settings-2'],pois:['Places','images'],hours:['Operating hours','clock-3'],export:['Files & backup','file-text']};
 function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;}
 function icon(name){return window.adminIcon(name);}
 function button(page,label,description){const b=element('button','admin-shortcut');b.type='button';b.dataset.adminPage=page;b.append(icon(pages[page][1]));const content=element('span');content.append(element('strong','',label||pages[page][0]));if(description)content.append(element('small','',description));b.append(content,icon('chevron-right'));return b;}
 const layout=element('div','admin-layout');workspace.before(layout);layout.append(nav);
 nav.setAttribute('aria-label','Live map administration');nav.replaceChildren();nav.append(element('span','admin-nav-caption','WORKSPACE'));
 for(const page of Object.keys(pages)){const b=element('button','app-nav-button');b.type='button';b.dataset.adminPage=page;b.dataset.section=page;b.setAttribute('aria-label',pages[page][0]);b.append(element('span','admin-nav-icon'),element('span','admin-nav-label',pages[page][0]));b.firstChild.append(icon(pages[page][1]));if(['pois','hours','export'].includes(page))b.classList.add('admin-desktop-item');nav.append(b);}
 const navNote=element('div','admin-nav-note');navNote.append(icon('shield-check'),element('span','','Apply edits, save a draft, then publish when ready.'));nav.append(navNote);
 const content=element('div','admin-content');layout.append(content);
 const overview=element('main','admin-overview');overview.id='admin-overview';overview.tabIndex=-1;
 const greeting=element('div','admin-page-heading');greeting.append(element('p','admin-eyebrow','SIGHTSEEING SHKODRA'),element('h1','','Your live map, at a glance.'),element('p','','Manage the route, check the van and keep passengers informed.'));overview.append(greeting);
 const metrics=element('div','admin-metrics');
 for(const [id,label,name]of [['stops','Active stops','map-pin'],['routes','Routes','bus-front'],['pois','Places','images'],['signal','GPS status','map']]){const card=element('div','admin-metric');const head=element('div','admin-metric-heading');head.append(icon(name),element('span','',label));card.append(head,element('strong','',id==='signal'?'Checking':'—'));card.lastChild.id='admin-metric-'+id;metrics.append(card);}overview.append(metrics);
 const columns=element('div','admin-dashboard-columns'),mapCard=element('section','admin-surface admin-dashboard-map'),mapHeading=element('div','admin-card-heading');mapHeading.append(element('h2','','Live map'),button('map','Open map'));mapCard.append(mapHeading);const mapSlot=element('div','admin-overview-map');mapCard.append(mapSlot);columns.append(mapCard);
 const tasks=element('div','admin-dashboard-tasks'),versionCard=element('section','admin-surface');versionCard.append(element('p','admin-eyebrow','MAP VERSIONS'),element('h2','','Ready for your passengers?'),element('p','admin-muted','Review your saved draft before publishing changes.'));
 for(const [label,id]of [['Saved draft','admin-draft-summary'],['Public version','admin-published-summary']]){const row=element('div','admin-version-row');row.append(element('span','',label),element('strong','','Not loaded'));row.lastChild.id=id;versionCard.append(row);}versionCard.append(button('map','Review map','Preview and publish from the toolbar'));tasks.append(versionCard);
 const operations=element('section','admin-surface');operations.append(element('h2','','Operations'),button('hours',null,'Set weekly service times'),button('stops',null,'Names, photos and stop order'),button('routes',null,'Path, styling and direction'));tasks.append(operations);columns.append(tasks);overview.append(columns);
 const more=element('main','admin-more');more.id='admin-more';more.tabIndex=-1;const moreHeading=element('div','admin-page-heading');moreHeading.append(element('p','admin-eyebrow','WORKSPACE'),element('h1','','More tools'),element('p','','Service settings, places and map backups.'));more.append(moreHeading);
 const moreTools=element('section','admin-surface admin-more-tools');for(const page of ['hours','pois','export'])moreTools.append(button(page,null,{hours:'Weekly hours and closed days',pois:'Manage points of interest',export:'Export a map or import a backup'}[page]));more.append(moreTools);
 const hoursSlot=element('section','admin-surface admin-hours-slot');more.append(hoursSlot);const hours=document.getElementById('service-hours-panel');if(hours)hoursSlot.append(hours);
 const publicView=element('button','admin-shortcut');publicView.type='button';publicView.dataset.action='previewPublicMap';publicView.append(icon('external-link'),element('span','','View public map'),icon('chevron-right'));moreTools.append(publicView);
 content.append(overview,workspace,more);workspace.setAttribute('role','main');workspace.setAttribute('aria-label','Map editing workspace');sidebar.setAttribute('aria-label','Map tools');editor.setAttribute('aria-label','Edit selected map item');
 const close=element('button','admin-context-close');close.type='button';close.setAttribute('aria-label','Close map tools');close.append(icon('x'));document.getElementById('context-panel-title').append(close);
 const skip=element('a','admin-skip','Skip to workspace');skip.href='#admin-overview';document.body.prepend(skip);
 document.getElementById('login-email').setAttribute('aria-label','Email address');document.getElementById('login-password').setAttribute('aria-label','Password');
 const brand=document.getElementById('brand');const identity=element('div','admin-workspace-identity');identity.append(element('strong','','Live map'),element('span','','Sightseeing Shkodra'));brand.append(identity);
 const logout=document.querySelector('#header-right [data-action="adminLogout"]');if(logout){logout.prepend(icon('log-out'));logout.setAttribute('aria-label','Sign out');}
 const preview=document.querySelector('#header-right [data-action="previewPublicMap"]');if(preview)preview.prepend(icon('external-link'));
 const findVan=document.querySelector('#gps-card .van-find');if(findVan){findVan.setAttribute('aria-label','Find van');const artwork=findVan.firstElementChild;artwork.removeAttribute('data-vehicle-icon');artwork.className='admin-control-icon';artwork.replaceChildren(icon('bus-front'));}
 const projectSelect=document.getElementById('admin-project-select');projectSelect.setAttribute('aria-label','Live map project');
 let current='overview';
 function clearContext(){workspace.classList.remove('context-open');workspace.dataset.contextSection='';document.body.classList.remove('mobile-context-open');sidebar.querySelectorAll('.context-section').forEach(p=>p.classList.remove('active'));}
 function resizeMap(){requestAnimationFrame(()=>window.app?.state?.map?.invalidateSize());}
 function select(page,focus=false){if(!pages[page])return;current=page;document.body.dataset.adminPage=page;
  overview.hidden=page!=='overview';more.hidden=!['more','hours'].includes(page);workspace.hidden=['overview','more','hours'].includes(page);
  if(page==='overview'){mapSlot.append(mapArea);}else workspace.insertBefore(mapArea,editor);
  if(!workspace.hidden){if(page==='map')clearContext();else window.app?.actions?.setAdminSection?.(page);}
  moreTools.hidden=page==='hours';hoursSlot.hidden=page!=='hours';if(hours)hours.open=page==='hours';
  moreHeading.querySelector('h1').textContent=page==='hours'?'Operating hours':'More tools';moreHeading.querySelector('p:last-child').textContent=page==='hours'?'Keep the public status in step with your service. All times are Shkodra local time.':'Service settings, places and map backups.';
  nav.querySelectorAll('button').forEach(b=>{const active=b.dataset.adminPage===page||b.dataset.adminPage==='more'&&['hours','pois','export'].includes(page);b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  skip.href=page==='overview'?'#admin-overview':['more','hours'].includes(page)?'#admin-more':'#workspace';workspace.tabIndex=-1;
  document.querySelector('.admin-workspace-identity strong').textContent=pages[page][0];resizeMap();if(focus){const target=page==='overview'?overview:page==='hours'||page==='more'?more:page==='map'?workspace:sidebar;if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});window.scrollTo(0,0);}
 }
 document.addEventListener('click',event=>{const b=event.target.closest('button[data-admin-page]');if(b){event.preventDefault();if(b.classList.contains('app-nav-button')&&b.dataset.adminPage===current&&workspace.classList.contains('context-open')){clearContext();resizeMap();}else select(b.dataset.adminPage,true);}});
 close.addEventListener('click',()=>{clearContext();resizeMap();nav.querySelector('[data-admin-page="map"]').focus();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&workspace.classList.contains('context-open')&&!workspace.classList.contains('editor-open')){clearContext();resizeMap();}});
 // Existing tools may open a panel or select an object without using the new navigation.
 new MutationObserver(()=>{if(workspace.classList.contains('editor-open')&&workspace.hidden)select(workspace.dataset.contextSection||'map');}).observe(workspace,{attributes:true,attributeFilter:['class']});
 document.addEventListener('click',event=>{const b=event.target.closest('[data-action="setAdminSection"]');if(b){event.preventDefault();event.stopPropagation();select(b.dataset.section||'map',true);}},true);
 function sync(){const count=id=>document.querySelectorAll('#'+id+' .admin-object-list-item').length;for(const [name,id]of [['stops','stop-list'],['routes','route-list'],['pois','poi-list']])document.getElementById('admin-metric-'+name).textContent=window.adminWorkflow?.savedData?String(name==='stops'?window.adminGetAllStops().filter(layer=>layer.feature.properties.active!==false).length:count(id)):'—';
  document.getElementById('admin-draft-summary').textContent=document.getElementById('last-saved-draft').textContent;document.getElementById('admin-published-summary').textContent=document.getElementById('last-published').textContent;document.getElementById('admin-metric-signal').textContent=document.getElementById('gps-state-label').textContent||'Checking';
 }
 const observer=new MutationObserver(sync);for(const id of ['stop-list','route-list','poi-list','last-saved-draft','last-published','gps-state-label'])observer.observe(document.getElementById(id),{childList:true,subtree:true,characterData:true});
 document.addEventListener('projectchange',sync);document.addEventListener('adminsessionended',()=>{select('overview');sync();});
 // Associate legacy form labels without changing input IDs or action bindings.
 document.querySelectorAll('.form-group').forEach(group=>{const label=group.querySelector('label'),input=group.querySelector('input:not([type=hidden]),select,textarea');if(label&&input?.id&&!label.htmlFor)label.htmlFor=input.id;});
 window.adminShell={select,sync};select('overview');sync();
})();
