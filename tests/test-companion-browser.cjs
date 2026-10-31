/* Full canonical public page, real Leaflet/Turf and controls; all service traffic mocked before dispatch. */
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright-core');
const root=path.resolve('frontend'),output=path.resolve(process.env.TRACKER_EVIDENCE_DIR||'reports/companion-20261031'),leaflet=path.dirname(require.resolve('leaflet/dist/leaflet.js'));
const mapData=require('./fixtures/published-map-106.json').map_data,photos=require('./fixtures/stop-photos/manifest.json');
const turfFile=process.env.PHASE1_TURF_FILE||path.join(__dirname,'fixtures/turf-7.3.5.min.js');assert(fs.existsSync(turfFile),'Supply existing pinned Turf 7.3.5 via PHASE1_TURF_FILE');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/host'){res.setHeader('Content-Type','text/html');res.end('<style>body{margin:0}iframe{display:block;border:0;width:100%;height:100%}</style><div style="width:'+Number(u.searchParams.get('w'))+'px;height:'+Number(u.searchParams.get('h'))+'px"><iframe allow="geolocation" title="Synthetic map frame" src="http://127.0.0.1:4199/live-map.html?embed=1&websiteStatus=external-v1"></iframe></div><div style="height:1000px">Parent content</div>');return;}const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(4199,'127.0.0.1',r));const parentServer=http.createServer(server.listeners('request')[0]);await new Promise(r=>parentServer.listen(3011,'127.0.0.1',r));fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});const results=[],errors=[],blocked=[],sent=[];try{
 const context=await browser.newContext({reducedMotion:'reduce',geolocation:{latitude:42.0683,longitude:19.5126,accuracy:10},permissions:['geolocation']});
 await context.addInitScript(({data})=>{
  window.fixtureData=data;window.fixtureReads=[];window.fixtureWrites=[];window.fixtureChannels=[];window.fixtureRevision=1;
  const fixtureStop=Number(new URLSearchParams(location.search).get('fixtureStop'))||3,fixtureAge=Number(new URLSearchParams(location.search).get('fixtureAge'))||0;
  const p=data.features.find(f=>String(f.properties.stopNumber)===String(fixtureStop)&&f.properties.pointType==='stop').geometry.coordinates;
  const at=new Date(Date.now()-fixtureAge*1000).toISOString();
  window.fixtureSnapshot={position:{latitude:p[1],longitude:p[0],speed_kmh:0,bearing_deg:0,source:'scorpiontrack',source_run_id:1,source_recorded_at:at,movement_state:'STATIONARY'},stop:{vehicle_id:'sightseeing-shkodra-van-1',project_id:'fixture-project',operational_state:{version:3,mapVersion:106,sourceRun:1,timestamp:at,currentStop:fixtureStop,nextStop:fixtureStop%5+1,status:'PARKED',movement:'STATIONARY',completedStops:fixtureStop===1?[1]:[1,fixtureStop],etaSeconds:null}},eta:null};
  window.fixturePush=()=>{fixtureRevision++;for(const c of fixtureChannels)if(c.table==='tracking_live_snapshots')c.row({new:{vehicle_id:'sightseeing-shkodra-van-1',revision:fixtureRevision,snapshot:structuredClone(fixtureSnapshot)}});};
  window.fixtureSdk={createClient(){return {getChannels:()=>[],removeChannel(){},channel(){const c={on(type,opts,cb){this.table=opts.table;this.row=cb;return this},subscribe(cb){fixtureChannels.push(this);setTimeout(()=>cb('SUBSCRIBED'),0);return this}};return c},from(table){fixtureReads.push(table);return {select(){return this},eq(){return this},order(){return this},limit(){return this},insert(){fixtureWrites.push(table);throw Error('Forbidden write')},update(){fixtureWrites.push(table);throw Error('Forbidden write')},upsert(){fixtureWrites.push(table);throw Error('Forbidden write')},async maybeSingle(){if(table==='tracking_live_snapshots'&&!window.fixtureClockReady){window.fixtureClockReady=true;const t=new Date(Date.now()-fixtureAge*1000).toISOString();fixtureSnapshot.position.source_recorded_at=t;fixtureSnapshot.stop.operational_state.timestamp=t;}return {data:table==='projects'?{id:'fixture-project',name:'Sightseeing Shkodra',slug:'sightseeing-shkodra',default_vehicle_id:'sightseeing-shkodra-van-1'}:table==='live_map_settings'?{gps_source:'scorpion'}:table==='tracking_pipeline_capabilities'?{central_verified:false}:table==='map_versions'?{id:106,published_at:'2026-10-25T10:00:00Z',map_data:fixtureData}:table==='tracking_live_snapshots'?{revision:fixtureRevision,snapshot:structuredClone(fixtureSnapshot)}:null}}}},rpc(){throw Error('No RPC expected')}}}};
 },{data:mapData});
 await context.route('**/*',async route=>{
  const req=route.request(),url=req.url();
  if((url.startsWith('http://127.0.0.1:4199/')||url.startsWith('http://127.0.0.1:3011/'))&&req.method()==='GET'){sent.push({method:req.method(),path:new URL(url).pathname});return route.continue();}
  if(url.includes('leaflet@1.9.4/dist/leaflet.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(leaflet,'leaflet.js'))});
  if(url.includes('leaflet@1.9.4/dist/leaflet.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(leaflet,'leaflet.css'))});
  if(url.includes('@supabase/supabase-js@'))return route.fulfill({contentType:'application/javascript',body:'window.supabase=window.fixtureSdk;'});
  if(url.includes('@turf/turf@7.3.5/'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(turfFile)});
  const photo=photos.find(p=>p.url===url);if(photo)return route.fulfill({contentType:photo.contentType,body:fs.readFileSync(path.join('tests/fixtures/stop-photos',photo.filename))});
  // Transparent tile and image fallback keeps the offline canvas deterministic.
  blocked.push({method:req.method(),host:new URL(url).hostname});return route.abort();
 });
 const page=await context.newPage();await page.clock.install({time:new Date()});page.on('pageerror',e=>errors.push(e.message));
 for(const [w,h] of [[320,568],[390,844],[1440,900],[844,390],[390,500]]){
  await page.setViewportSize({width:w,height:h});
  await page.goto('http://127.0.0.1:3011/host?w='+w+'&h='+h);
  let f=await(await page.locator('iframe').elementHandle()).contentFrame();
  await f.waitForFunction(()=>window.publicOperationalStatus);
  for(let i=0;i<4;i++){await page.clock.fastForward(10000);await f.evaluate(()=>{const at=new Date().toISOString();fixtureSnapshot.position.source_recorded_at=at;fixtureSnapshot.stop.operational_state.timestamp=at;fixturePush()});await f.waitForFunction(()=>publicOperationalStatus.lastObservationAt===fixtureSnapshot.position.source_recorded_at);}
  assert.equal(await f.evaluate(()=>publicOperationalStatus.phase),'PARKED');
  assert(await f.locator('#next-card').isVisible());
  await page.evaluate(()=>{window.received=[];window.addEventListener('message',e=>received.push({data:e.data,origin:e.origin}));window.requestJourney=(data={type:'shkodra:request-journey',version:1,embeddedDisplayVersion:1})=>document.querySelector('iframe').contentWindow.postMessage(data,'http://127.0.0.1:4199');requestJourney({...{type:'shkodra:request-journey',version:2,embeddedDisplayVersion:1}})});
  await page.waitForTimeout(80);assert(await f.locator('#next-card').isVisible());assert.equal(await page.evaluate(()=>received.length),0);
  await page.evaluate(()=>requestJourney());
  await f.waitForFunction(()=>document.getElementById('app').dataset.websiteStatus==='external-v1');
  await page.waitForFunction(()=>received.some(x=>x.data.embeddedDisplay));
  assert(!(await f.locator('#next-card').isVisible()));
  const parity=await f.evaluate(()=>{const m=publicOperationalStatus,v=touristView.project(m);return {label:v.label,destination:v.destination,activity:v.activity||'',eta:v.eta,live:v.live}});
  const response=await page.evaluate(()=>received.at(-1));
  for(const [k,v]of Object.entries(parity))assert.equal(response.data.embeddedDisplay[k],v);
  assert.equal(response.origin,'http://127.0.0.1:4199');assert(!/latitude|longitude|source_run|speed_kmh/.test(JSON.stringify(response.data)));
  const toolbar=await f.locator('#map-controls').boundingBox();assert(toolbar.x>=0&&toolbar.x+toolbar.width<=w&&toolbar.y+toolbar.height<=h);
  await page.screenshot({path:output+'/embedded-'+w+'x'+h+'.png'});
  // Existing 5s status render cadence renews transport without changing observation timestamps.
  const before=await page.evaluate(()=>received.length);await page.clock.fastForward(10000);
  assert(await page.evaluate(n=>received.length>n,before));
  assert.equal(await page.evaluate(()=>received.at(-1).data.lastObservationAt),response.data.lastObservationAt);
  await page.clock.fastForward(181000);await f.waitForFunction(()=>publicOperationalStatus.phase==='UNKNOWN');
  assert.equal(await page.evaluate(()=>received.at(-1).data.phase),'UNKNOWN');assert.equal(await page.evaluate(()=>received.at(-1).data.embeddedDisplay.live),false);
  // Reload loses capability until the real parent sends its next load handshake.
  await Promise.all([f.waitForNavigation(),f.evaluate(()=>location.reload())]);await f.waitForFunction(()=>window.publicOperationalStatus);
  assert(await f.locator('#next-card').isVisible());await page.evaluate(()=>requestJourney());await f.waitForFunction(()=>document.getElementById('app').dataset.websiteStatus==='external-v1');
  results.push({w,h,projectionParity:true,expiry:true,reload:true});
 }
 // Full-runtime standalone acceptance: actual controls, keyed stop list and default/copy isolation.
 for(const [w,h] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[844,390],[390,500]])for(const suffix of (w===390&&h===844?['','?embed=1&websiteStatus=external-v1']:[''])){
  await page.setViewportSize({width:w,height:h});
  await page.goto('http://127.0.0.1:4199/live-map.html'+suffix);await page.waitForFunction(()=>window.publicOperationalStatus);
  assert(await page.locator('#next-card').isVisible());assert.equal(await page.locator('#app').getAttribute('data-website-status'),null);
  assert.equal(await page.locator('.tourist-stop-icon .photo-stop').count(),5);
  assert.equal(await page.locator('#tourist-timeline .stop-photo,#tourist-timeline .journey-stop-name').count(),0);
  assert.deepEqual(await page.locator('#tourist-timeline .journey-circle').allTextContents(),await page.evaluate(()=>touristView.project(publicOperationalStatus).stops.map(s=>s.checked?'✓':s.number)));
  assert.equal(await page.locator('.van-marker-wrap .vehicle-symbol').getAttribute('src'),'assets/brand/sightseeing-van.svg');
  await page.waitForFunction(()=>document.querySelector('.van-marker-wrap .vehicle-symbol')?.naturalWidth>0);
  assert(await page.locator('.leaflet-control-attribution').isVisible());
  const geometry=await page.evaluate(()=>{const c=document.getElementById('next-card').getBoundingClientRect(),d=document.getElementById('map-controls').getBoundingClientRect();return {cardBottom:c.bottom,toolbarTop:d.top,toolbarBottom:d.bottom,toolbarLeft:d.left,toolbarRight:d.right,w:innerWidth,h:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}});
  assert(!geometry.overflow);assert(geometry.toolbarLeft>=0&&geometry.toolbarRight<=w+1&&geometry.toolbarBottom<=h+1);assert(geometry.cardBottom<=geometry.toolbarTop,JSON.stringify(geometry));
  await page.locator('#btn-find-me').click();await page.waitForFunction(()=>userPosition!==null);assert.equal(await page.locator('#btn-find-me').getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>document.getElementById('nearest-stop-card').classList.contains('visible'));
  assert(await page.locator('#nearest-stop-card').isVisible());const userPopup=await page.locator('.user-location-popup').boundingBox(),userText=await page.locator('.user-location-popup strong').boundingBox();assert(userPopup&&userText&&Math.abs(userPopup.x+userPopup.width/2-userText.x-userText.width/2)<2,'You are here text should be centered in its popup');assert.equal(await page.evaluate(()=>String(nearestStopRecord.feature.properties.stopNumber)),'1');assert((await page.locator('#nearest-stop-distance').innerText()).includes('from you'));assert(await page.locator('#walk-to-stop').isVisible());assert.equal(await page.locator('#stops-panel').getAttribute('aria-hidden'),'true');
  const nearestBounds=await page.locator('#nearest-stop-card').boundingBox(),controlsBounds=await page.locator('#map-controls').boundingBox();assert(nearestBounds.x>=0&&nearestBounds.x+nearestBounds.width<=w+1&&nearestBounds.y>=0&&nearestBounds.y+nearestBounds.height<=controlsBounds.y+1);
  const zoomBounds=await page.locator('.leaflet-control-zoom').boundingBox();assert(!zoomBounds||nearestBounds.x+nearestBounds.width<=zoomBounds.x||zoomBounds.x+zoomBounds.width<=nearestBounds.x||nearestBounds.y+nearestBounds.height<=zoomBounds.y||zoomBounds.y+zoomBounds.height<=nearestBounds.y,'Nearest stop card must not cover zoom controls');
  if(w===390&&h===844||w===768||w===1440)await page.screenshot({path:output+'/find-me-'+w+'.png'});

  await page.locator('#btn-find-van').click();assert.equal(await page.evaluate(()=>followVan),true);
  await page.locator('#btn-route').click();assert.equal(await page.evaluate(()=>followVan),false);assert.equal(await page.locator('#btn-route').getAttribute('aria-pressed'),'true');
  await page.locator('#btn-stops').click();await page.clock.runFor(300);assert.equal(await page.locator('.arrival-item').count(),5);
  assert.deepEqual(await page.locator('.arrival-item .stop-number-badge').allTextContents(),['1','2','3','4','5']);
  await page.locator('.arrival-item').nth(1).focus();await page.clock.fastForward(10000);assert(await page.locator('.arrival-item').nth(1).evaluate(el=>el===document.activeElement));
  if(w===390&&h===844)await page.screenshot({path:output+'/stops-390.png'});
  await page.locator('#stops-panel').press('Escape');assert.equal(await page.locator('#stops-panel').getAttribute('aria-hidden'),'true');
  await page.locator('#btn-find-van').click();assert.equal(await page.evaluate(()=>followVan),true);
  const target=await page.evaluate(()=>stopRecords[0].feature.properties.name);await page.locator('#tourist-timeline button').first().click();await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>followVan),false);assert((await page.locator('.leaflet-popup').innerText()).includes(target));
  await page.clock.fastForward(10000);assert((await page.locator('.leaflet-popup').innerText()).includes(target));
  await page.locator('#btn-find-van').click();assert.equal(await page.evaluate(()=>followVan),true);assert.deepEqual(await page.evaluate(()=>fixtureWrites),[]);
  const clearVan=await page.evaluate(()=>{const van=document.querySelector('#map .van-marker-wrap .vehicle-symbol')?.getBoundingClientRect();return [...document.querySelectorAll('.stop-near-van .stop-photo-frame')].every(el=>{const p=el.getBoundingClientRect();return !van||p.bottom<=van.top||p.top>=van.bottom||p.right<=van.left||p.left>=van.right})});assert(clearVan,'Stop photos must not be covered by the illustrated van');
  if(w===390&&h===844||w===768||w===1440)await page.screenshot({path:output+'/standalone-final-'+w+(suffix?'-copied-opt-in':'')+'.png'});
  results.push({mode:'standalone',w,h,copiedOptIn:!!suffix,realControls:true,focusPreserved:true,popupPersists:true,...geometry});
 }
 // Approved first-load historical context: actual full child runtime, isolated source snapshot.
 for(const [w,h] of [[390,844],[768,1024],[1440,900]]){
  await page.setViewportSize({width:w,height:h});await page.goto('http://127.0.0.1:4199/live-map.html?fixtureStop=1&fixtureAge=270');await page.waitForFunction(()=>window.publicOperationalStatus?.message==='At stop: Start/Stop');
  assert.equal(await page.locator('#journey-eta-row').isVisible(),false);assert.equal(await page.locator('#operational-live').isVisible(),false);assert.equal(await page.evaluate(()=>publicOperationalStatus.completedStops.length),0);assert.equal(await page.evaluate(()=>vanMarker.options.opacity),1);assert(await page.evaluate(()=>vanMarker.getLatLng().distanceTo(L.latLng(canonicalLivePosition.latitude,canonicalLivePosition.longitude))<1));
  assert.equal(await page.locator('#tourist-timeline .journey-circle').count(),5);assert.equal(await page.evaluate(()=>followVan),true);await page.waitForFunction(()=>map.getZoom()===VAN_FOLLOW_ZOOM);
  await page.screenshot({path:output+'/historical-stop1-'+w+'.png'});
  await page.reload();await page.waitForFunction(()=>window.publicOperationalStatus?.message==='At stop: Start/Stop');
  await page.clock.fastForward(331000);await page.waitForFunction(()=>publicOperationalStatus.message==='Live location unavailable');assert.equal(await page.evaluate(()=>vanMarker.options.opacity),1);assert.equal(await page.evaluate(()=>followVan),true);assert((await page.locator('.van-marker-wrap').getAttribute('title')||await page.locator('.van-marker-wrap').evaluate(el=>el.parentElement.title)).includes('Last reported position'));assert.equal(await page.locator('#journey-eta-row').isVisible(),false);await page.screenshot({path:output+'/unavailable-'+w+'.png'});
  results.push({mode:'historical-first-load-reload-expiry',w,h,noInventedVisit:true,fadedVan:true});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(output+'/browser.json',JSON.stringify({result:'PASS',results,errors,limitations:['Real child runtime with synthetic transport and offline assets; separate paired-stop runner covers actual website','Physical devices, real GPS, canonical redirects and paired acceptance remain pending']},null,2));
 console.log('PASS companion real-runtime iframe, projection parity, cadence, expiry, reload and standalone browser checks');
 }finally{await browser.close();server.close();parentServer.close()}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
