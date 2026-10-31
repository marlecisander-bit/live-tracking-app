/* eslint-disable @typescript-eslint/no-require-imports -- Node-only paired acceptance runner with companion CommonJS fixtures. */
/* Paired actual Next.js + canonical Live Map; transport/assets only are synthetic. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const companion=path.resolve(__dirname,'..');
const {chromium}=require(path.join(companion,'node_modules/playwright-core'));
const output=path.join(companion,'reports/companion-20261031/paired-final'),leaflet=path.dirname(require.resolve(path.join(companion,'node_modules/leaflet/dist/leaflet.js')));
const mapData=require(path.join(companion,'tests/fixtures/published-map-106.json')).map_data,photos=require(path.join(companion,'tests/fixtures/stop-photos/manifest.json'));
const turfFile=path.join(companion,'tests/fixtures/turf-7.3.5.min.js');
fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const results=[],errors=[],blocked=[],sent=[];
try {const context=await browser.newContext({reducedMotion:'reduce',geolocation:{latitude:42.0683,longitude:19.5126,accuracy:10},permissions:['geolocation']});
 await context.addInitScript(({data})=>{
  window.fixtureBlockHandshake=true;window.fixtureMessages=[];
  window.addEventListener('message',e=>{if(location.port==='4199'&&e.data?.type==='shkodra:request-journey'&&window.fixtureBlockHandshake)e.stopImmediatePropagation();if(e.data?.type==='shkodra:journey')fixtureMessages.push({data:e.data,origin:e.origin});},true);
  if(location.port==='4199'&&sessionStorage.getItem('paired-long'))for(const feature of data.features)if(feature.properties.pointType==='stop')feature.properties.name='A long translated destination name for testing narrow website containers and contextual journey displays';
  window.fixtureData=data;window.fixtureReads=[];window.fixtureWrites=[];window.fixtureChannels=[];window.fixtureRevision=1;
  const p=data.features.find(f=>String(f.properties.stopNumber)==='3'&&f.properties.pointType==='stop').geometry.coordinates;
  const at=new Date().toISOString();
  window.fixtureSnapshot={position:{latitude:p[1],longitude:p[0],speed_kmh:0,bearing_deg:0,source:'scorpiontrack',source_run_id:1,source_recorded_at:at,movement_state:'STATIONARY'},stop:{vehicle_id:'sightseeing-shkodra-van-1',project_id:'fixture-project',operational_state:{version:3,mapVersion:106,sourceRun:1,timestamp:at,currentStop:3,nextStop:4,status:'PARKED',movement:'STATIONARY',completedStops:[1,3],etaSeconds:null}},eta:null};
  window.fixturePush=()=>{fixtureRevision++;for(const c of fixtureChannels)if(c.table==='tracking_live_snapshots')c.row({new:{vehicle_id:'sightseeing-shkodra-van-1',revision:fixtureRevision,snapshot:structuredClone(fixtureSnapshot)}});};
  window.fixtureSdk={createClient(){return {getChannels:()=>[],removeChannel(){},channel(){const c={on(type,opts,cb){this.table=opts.table;this.row=cb;return this},subscribe(cb){fixtureChannels.push(this);setTimeout(()=>cb('SUBSCRIBED'),0);return this}};return c},from(table){fixtureReads.push(table);return {select(){return this},eq(){return this},order(){return this},limit(){return this},insert(){fixtureWrites.push(table);throw Error('Forbidden write')},update(){fixtureWrites.push(table);throw Error('Forbidden write')},upsert(){fixtureWrites.push(table);throw Error('Forbidden write')},async maybeSingle(){if(table==='tracking_live_snapshots'&&!window.fixtureClockReady){window.fixtureClockReady=true;const t=new Date().toISOString();fixtureSnapshot.position.source_recorded_at=t;fixtureSnapshot.stop.operational_state.timestamp=t;}return {data:table==='projects'?{id:'fixture-project',name:'Sightseeing Shkodra',slug:'sightseeing-shkodra',default_vehicle_id:'sightseeing-shkodra-van-1'}:table==='live_map_settings'?{gps_source:'scorpion'}:table==='tracking_pipeline_capabilities'?{central_verified:false}:table==='map_versions'?{id:106,published_at:'2026-10-25T10:00:00Z',map_data:fixtureData}:table==='tracking_live_snapshots'?{revision:fixtureRevision,snapshot:structuredClone(fixtureSnapshot)}:null}}}},rpc(){throw Error('No RPC expected')}}}};
 },{data:mapData});
 await context.route('**/*',async route=>{
  const req=route.request(),url=req.url();
  if((url.startsWith('http://127.0.0.1:4199/')||url.startsWith('http://127.0.0.1:3011/'))&&req.method()==='GET'){sent.push({method:req.method(),path:new URL(url).pathname});return route.continue();}
  if(url.includes('leaflet@1.9.4/dist/leaflet.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(leaflet,'leaflet.js'))});
  if(url.includes('leaflet@1.9.4/dist/leaflet.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(leaflet,'leaflet.css'))});
  if(url.includes('@supabase/supabase-js@'))return route.fulfill({contentType:'application/javascript',body:'window.supabase=window.fixtureSdk;'});
  if(url.includes('@turf/turf@7.3.5/'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(turfFile)});
  const photo=photos.find(p=>p.url===url);if(photo)return route.fulfill({contentType:photo.contentType,body:fs.readFileSync(path.join(companion,'tests/fixtures/stop-photos',photo.filename))});
  // Transparent tile and image fallback keeps the offline canvas deterministic.
  blocked.push({method:req.method(),host:new URL(url).hostname});return route.abort();
 });

 const page=await context.newPage();await page.clock.install({time:new Date()});page.on('pageerror',e=>errors.push(e.message));
 const panel=()=>page.locator('[aria-label="Live van status"]');
 async function child(){return (await page.locator('iframe[title="Sightseeing Shkodra live van map"]').elementHandle()).contentFrame();}
 async function open(url){await page.goto('http://127.0.0.1:3011'+url);await page.locator('iframe[title="Sightseeing Shkodra live van map"]').scrollIntoViewIfNeeded();const f=await child();await f.waitForFunction(()=>window.publicOperationalStatus);return f;}
 async function activate(f){await f.evaluate(()=>fixtureBlockHandshake=false);await page.clock.fastForward(3100);await f.waitForFunction(()=>document.getElementById('app').dataset.websiteStatus==='external-v1');await page.waitForFunction(()=>document.querySelector('[aria-label="Live van status"]')?.textContent.includes('PLANNED')||document.querySelector('[aria-label="Live van status"]')?.textContent.includes('PARKED'));}
 async function parity(f){const d=await page.evaluate(()=>fixtureMessages.filter(m=>m.data.embeddedDisplay).at(-1)?.data);assert(d);const v=await f.evaluate(()=>{const m=publicOperationalStatus,v=touristView.project(m);return {label:v.label,destination:v.destination,activity:v.activity||'',eta:v.eta,live:v.live,nextStop:m.nextConfirmedStop?.name||'',stops:v.stops.map(s=>({id:s.id,number:String(s.number),name:s.name,label:s.label,state:s.viewState}))}});assert.deepEqual(d.embeddedDisplay,{version:1,...v});const text=await panel().innerText();for(const key of ['label','destination','activity','eta'])if(v[key])assert(text.includes(v[key]),key+': '+text);assert.equal(await panel().locator('li').count(),v.stops.length);assert(!/latitude|longitude|source_run|speed_kmh|coordinates/.test(JSON.stringify(d)));assert.equal(await panel().count(),1);assert(!(await f.locator('#next-card').isVisible()));return d;}
 async function fresh(f){await f.evaluate(()=>{const at=new Date().toISOString();fixtureSnapshot.position.source_recorded_at=at;fixtureSnapshot.stop.operational_state.timestamp=at;fixturePush()});await f.waitForFunction(()=>publicOperationalStatus.lastObservationAt===fixtureSnapshot.position.source_recorded_at);}
 await page.setViewportSize({width:390,height:844});let f=await open('/route');
 assert((await panel().innerText()).includes('Connecting'));assert(await f.locator('#next-card').isVisible());await page.screenshot({path:output+'/connecting.png'});
 // Deliver invalid requests through the actual parent window; child must retain its card.
 for(const request of [{version:2,embeddedDisplayVersion:1},{version:1,embeddedDisplayVersion:'1'},{version:1,embeddedDisplayVersion:99}]){
 await f.evaluate(()=>fixtureBlockHandshake=false);await page.evaluate(data=>document.querySelector('iframe').contentWindow.postMessage({type:'shkodra:request-journey',...data},'http://127.0.0.1:4199'),request);await page.waitForTimeout(30);assert(await f.locator('#next-card').isVisible());await f.evaluate(()=>fixtureBlockHandshake=true);}
 await activate(f);await parity(f);
 for(let i=0;i<4;i++){await page.clock.fastForward(10000);await fresh(f)}await f.waitForFunction(()=>publicOperationalStatus.phase==='PARKED');let d=await parity(f);await page.screenshot({path:output+'/parked-390.png'});
 await page.clock.fastForward(10000);await parity(f);assert.equal(await page.evaluate(()=>fixtureMessages.at(-1).data.lastObservationAt),d.lastObservationAt);
 await page.clock.fastForward(181000);await f.waitForFunction(()=>publicOperationalStatus.phase==='UNKNOWN');await parity(f);assert.equal(await page.evaluate(()=>fixtureMessages.at(-1).data.embeddedDisplay.live),false);await page.screenshot({path:output+'/expired-unknown.png'});
 results.push({case:'handshake-parity-heartbeat-parking-expiry',pass:true});
 // Stop commands use actual IDs and open the real Leaflet popup.
 const stop=await page.evaluate(()=>fixtureMessages.at(-1).data.embeddedDisplay.stops[0]);await panel().locator('button').first().click();await f.waitForFunction(()=>followVan===false);await page.clock.runFor(700);await f.locator('.leaflet-popup').waitFor();assert((await f.locator('.leaflet-popup').innerText()).includes(stop.name));
 await page.locator('iframe').scrollIntoViewIfNeeded();await page.screenshot({path:output+'/stop-popup.png'});const popupBounds=await f.locator('.leaflet-popup').evaluate(el=>el.getBoundingClientRect().toJSON());const childViewport=await f.evaluate(()=>({w:innerWidth,h:innerHeight}));assert(popupBounds.x>=0&&popupBounds.y>=0&&popupBounds.right<=childViewport.w&&popupBounds.bottom<=childViewport.h);results.push({case:'stop-popup',bounds:popupBounds,childViewport});console.log('POPUP',JSON.stringify(results.at(-1)));await f.evaluate(()=>map.closePopup());
 const stable=await panel().innerText();
 // Actual same-child sender with invalid schema/version, and same-origin wrong window.
 for(const bad of [{...d,version:2},{...d,embeddedDisplay:{version:99}},{...d,stops:null}])await f.evaluate(data=>parent.postMessage(data,'http://127.0.0.1:3011'),bad);
 await page.evaluate(data=>window.postMessage(data,location.origin),{...d,embeddedDisplay:{...d.embeddedDisplay,destination:'UNAUTHORIZED'}});await page.waitForTimeout(50);assert.equal(await panel().innerText(),stable);
 // Wrong-origin nested frame, then a same-child window with wrong reported origin.
 await page.evaluate(data=>window.dispatchEvent(new MessageEvent('message',{origin:'http://127.0.0.1:4200',source:document.querySelector('iframe').contentWindow,data})),d);assert.equal(await panel().innerText(),stable);
 results.push({case:'stop-command-malformed-version-source-origin',pass:true,originNote:'wrong-origin MessageEvent plus actual cross-window source; exact origin unit tests also run'});
 // Parent discards stale data even when the child transport is silenced.
 await f.evaluate(()=>{fixtureBlockHandshake=true;window.sendJourneyPresentation=()=>{};window.publicPresentation.render=()=>{}});await page.clock.fastForward(46000);assert((await panel().innerText()).includes('temporarily unavailable'));await page.screenshot({path:output+'/transport-expired.png'});
 // Iframe navigation resets website claims; it must handshake again after load.
 await Promise.all([f.waitForNavigation(),f.evaluate(()=>location.reload())]);f=await child();await f.waitForFunction(()=>window.publicOperationalStatus);assert((await panel().innerText()).includes('Connecting'));assert(await f.locator('#next-card').isVisible());await activate(f);await parity(f);
 results.push({case:'transport-expiry-iframe-reload',pass:true});
 const sizes=[[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[844,390],[390,500]];
 for(const url of ['/route','/dev/live-map-preview?presentation=compact'])for(const [w,h]of sizes){await page.setViewportSize({width:w,height:h});f=await open(url);await activate(f);await parity(f);
 const iframe=page.locator('iframe[title="Sightseeing Shkodra live van map"]');
 const geometry=await page.evaluate(()=>{const p=document.querySelector('[aria-label="Live van status"]'),i=document.querySelector('iframe'),container=i.closest('.interactive-widget');return {pageOverflow:document.documentElement.scrollWidth>innerWidth,panel:p.getBoundingClientRect().toJSON(),frame:i.getBoundingClientRect().toJSON(),mapOverflow:container.scrollWidth>container.clientWidth,otherStatus:document.querySelectorAll('[aria-label="Live journey status"]').length}});
 assert.equal(geometry.otherStatus,0);assert(!geometry.mapOverflow);assert(geometry.panel.bottom<=geometry.frame.top+1);
 const toolbar=await f.locator('#map-controls').evaluate(el=>el.getBoundingClientRect().toJSON());const dim=await f.evaluate(()=>({w:innerWidth,h:innerHeight}));assert(toolbar.x>=0&&toolbar.x+toolbar.width<=dim.w+1&&toolbar.y>=0&&toolbar.y+toolbar.height<=dim.h+1,JSON.stringify({toolbar,dim}));
 await iframe.locator('..').locator('..').screenshot({path:output+'/'+(url==='/route'?'route':'compact')+'-'+w+'x'+h+'.png'});
 if(url!=='/route'){const toggle=page.getByRole('button',{name:'Interact with map',exact:true});await toggle.click();assert.equal(await iframe.getAttribute('tabindex'),'0');await page.getByRole('button',{name:'Done interacting',exact:true}).click();assert.equal(await iframe.getAttribute('tabindex'),'-1');}
 results.push({page:url,w,h,...geometry,toolbarInside:true,parity:true});}
 // Real controls on Route. Find me uses browser-provided synthetic geolocation.
 f=await open('/route');await activate(f);console.log('CONTROLS',await f.locator('#map-controls').innerText());
 for(const [name,id] of [['Find me','btn-find-me'],['Find van','btn-find-van'],['Route','btn-route'],['Stops','btn-stops']]){const button=f.locator('#'+id);if(await button.count()){await button.click();await page.waitForTimeout(80);results.push({control:name,clicked:true});if(name==='Stops')await button.click();}else results.push({control:name,missing:true});}
 await panel().locator('button').first().focus();await page.keyboard.press('Tab');assert.equal(await panel().locator('button').nth(1).evaluate(el=>el===document.activeElement),true);
 assert(await f.locator('.leaflet-control-attribution').isVisible());await page.screenshot({path:output+'/controls-focus.png'});
 // Navigation unmount/remount across real full/compact integrations.
 f=await open('/dev/live-map-preview?presentation=compact');await activate(f);await parity(f);f=await open('/route');await activate(f);await parity(f);results.push({case:'navigation-remount',pass:true});
 // Long names go through the actual child's normal model and rendering path.
 await f.evaluate(()=>sessionStorage.setItem('paired-long','1'));await Promise.all([f.waitForNavigation(),f.evaluate(()=>location.reload())]);f=await child();await f.waitForFunction(()=>window.publicOperationalStatus);await activate(f);await parity(f);await page.setViewportSize({width:320,height:568});assert((await panel().innerText()).includes('A long translated'));assert.equal(await panel().evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.locator('iframe').locator('..').locator('..').screenshot({path:output+'/long-labels-320.png'});await f.evaluate(()=>sessionStorage.removeItem('paired-long'));results.push({case:'long-labels-real-model',pass:true});
 // Missing opt-in: actual child retains its internal panel; legacy journey cannot mark external mode ready.
 const frameEl=page.locator('iframe');await Promise.all([f.waitForNavigation(),frameEl.evaluate(el=>{el.src=el.src.replace('&websiteStatus=external-v1','')})]);f=await child();await f.waitForFunction(()=>window.publicOperationalStatus);await f.evaluate(()=>fixtureBlockHandshake=false);await page.clock.runFor(300);await page.clock.fastForward(21000);await page.clock.runFor(100);assert(await f.locator('#next-card').isVisible());assert((await panel().innerText()).includes('Live status unavailable'));await page.locator('iframe').locator('..').locator('..').screenshot({path:output+'/missing-opt-in-unavailable.png'});results.push({case:'missing-query-opt-in-and-unavailable',pass:true});
 // Standalone/copy retains original card despite capability requests to self.
 for(const suffix of ['', '?embed=1&websiteStatus=external-v1']){await page.goto('http://127.0.0.1:4199/live-map.html'+suffix);await page.waitForFunction(()=>window.publicOperationalStatus);await page.evaluate(()=>window.postMessage({type:'shkodra:request-journey',version:1,embeddedDisplayVersion:1},location.origin));assert(await page.locator('#next-card').isVisible());assert.equal(await page.locator('#app').getAttribute('data-website-status'),null);await page.screenshot({path:output+'/standalone'+(suffix?'-copied':'')+'.png'});}
 fs.writeFileSync(output+'/browser.json',JSON.stringify({result:'PASS',results,errors,blocked,limitations:['Synthetic tracking/transport and geolocation; offline tiles absent','Physical touch, iOS safe areas and hosted pairing remain unverified']},null,2));assert.deepEqual(errors,[]);console.log('PASS paired actual applications; final companion popup fixed',results.length,JSON.stringify(errors));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
