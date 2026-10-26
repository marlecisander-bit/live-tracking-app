/* Full canonical public page, real Leaflet/Turf and controls; all service traffic mocked before dispatch. */
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright-core');
const root=path.resolve('frontend'),output=path.resolve('reports/phase1'),leaflet=path.dirname(require.resolve('leaflet/dist/leaflet.js'));
const mapData=require('./fixtures/published-map-106.json').map_data,photos=require('./fixtures/stop-photos/manifest.json');
const turfFile=process.env.PHASE1_TURF_FILE||path.join(__dirname,'fixtures/turf-7.3.5.min.js');assert(fs.existsSync(turfFile),'Supply existing pinned Turf 7.3.5 via PHASE1_TURF_FILE');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/host'){res.setHeader('Content-Type','text/html');res.end('<style>body{margin:0}iframe{display:block;border:0;width:100%;height:100%}</style><div style="width:'+Number(u.searchParams.get('w'))+'px;height:'+Number(u.searchParams.get('h'))+'px"><iframe title="Synthetic map frame" src="/live-map.html?embed=1"></iframe></div><div style="height:1000px">Parent content</div>');return;}const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(4201,'127.0.0.1',r));const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});const results=[],errors=[],blocked=[],sent=[];try{
 const context=await browser.newContext({reducedMotion:'reduce',geolocation:{latitude:42.0683,longitude:19.5126,accuracy:10},permissions:['geolocation']});
 await context.addInitScript(({data})=>{
  window.fixtureData=data;window.fixtureReads=[];window.fixtureWrites=[];window.fixtureChannels=[];window.fixtureRevision=1;
  const p=data.features.find(f=>String(f.properties.stopNumber)==='3'&&f.properties.pointType==='stop').geometry.coordinates;
  const at=new Date().toISOString();
  window.fixtureSnapshot={position:{latitude:p[1],longitude:p[0],speed_kmh:0,bearing_deg:0,source:'scorpiontrack',source_run_id:1,source_recorded_at:at,movement_state:'STATIONARY'},stop:{vehicle_id:'sightseeing-shkodra-van-1',project_id:'fixture-project',operational_state:{version:3,mapVersion:106,sourceRun:1,timestamp:at,currentStop:3,nextStop:4,status:'PARKED',movement:'STATIONARY',completedStops:[1,3],etaSeconds:null}},eta:null};
  window.fixturePush=()=>{fixtureRevision++;for(const c of fixtureChannels)if(c.table==='tracking_live_snapshots')c.row({new:{vehicle_id:'sightseeing-shkodra-van-1',revision:fixtureRevision,snapshot:structuredClone(fixtureSnapshot)}});};
  window.fixtureSdk={createClient(){return {getChannels:()=>[],removeChannel(){},channel(){const c={on(type,opts,cb){this.table=opts.table;this.row=cb;return this},subscribe(cb){fixtureChannels.push(this);setTimeout(()=>cb('SUBSCRIBED'),0);return this}};return c},from(table){fixtureReads.push(table);return {select(){return this},eq(){return this},order(){return this},limit(){return this},insert(){fixtureWrites.push(table);throw Error('Forbidden write')},update(){fixtureWrites.push(table);throw Error('Forbidden write')},upsert(){fixtureWrites.push(table);throw Error('Forbidden write')},async maybeSingle(){if(table==='tracking_live_snapshots'&&!window.fixtureClockReady){window.fixtureClockReady=true;const t=new Date().toISOString();fixtureSnapshot.position.source_recorded_at=t;fixtureSnapshot.stop.operational_state.timestamp=t;}return {data:table==='projects'?{id:'fixture-project',name:'Sightseeing Shkodra',slug:'sightseeing-shkodra',default_vehicle_id:'sightseeing-shkodra-van-1'}:table==='live_map_settings'?{gps_source:'scorpion'}:table==='tracking_pipeline_capabilities'?{central_verified:false}:table==='map_versions'?{id:106,published_at:'2026-10-25T10:00:00Z',map_data:fixtureData}:table==='tracking_live_snapshots'?{revision:fixtureRevision,snapshot:structuredClone(fixtureSnapshot)}:null}}}},rpc(){throw Error('No RPC expected')}}}};
 },{data:mapData});
 await context.route('**/*',async route=>{
  const req=route.request(),url=req.url();
  if(url.startsWith('http://127.0.0.1:4201/')&&req.method()==='GET'){sent.push({method:req.method(),path:new URL(url).pathname});return route.continue();}
  if(url.includes('leaflet@1.9.4/dist/leaflet.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(leaflet,'leaflet.js'))});
  if(url.includes('leaflet@1.9.4/dist/leaflet.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(leaflet,'leaflet.css'))});
  if(url.includes('@supabase/supabase-js@'))return route.fulfill({contentType:'application/javascript',body:'window.supabase=window.fixtureSdk;'});
  if(url.includes('@turf/turf@7.3.5/'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(turfFile)});
  const photo=photos.find(p=>p.url===url);if(photo)return route.fulfill({contentType:photo.contentType,body:fs.readFileSync(path.join('tests/fixtures/stop-photos',photo.filename))});
  // Transparent tile and image fallback keeps the offline canvas deterministic.
  blocked.push({method:req.method(),host:new URL(url).hostname});return route.abort();
 });
 const page=await context.newPage();await page.clock.install({time:new Date()});page.on('pageerror',e=>errors.push(e.message));
 for(const mode of ['standalone','iframe'])for(const [w,h]of [[320,568],[375,667],[390,844],[430,932],[768,1024],[1440,900],[667,375]]){
  await page.setViewportSize({width:mode==='iframe'?Math.max(800,w):w,height:mode==='iframe'?Math.max(800,h):h});
  await page.goto(mode==='iframe'?'http://127.0.0.1:4201/host?w='+w+'&h='+h:'http://127.0.0.1:4201/live-map.html',{waitUntil:'load'});
  const f=mode==='iframe'?await(await page.locator('iframe').elementHandle()).contentFrame():page;
  await f.waitForFunction(()=>window.publicOperationalStatus?.currentStop?.number==='3');
  await page.waitForTimeout(120);
  assert.equal(await f.locator('#van-movement-status').textContent(),'At '+mapData.features.find(f=>String(f.properties.stopNumber)==='3'&&f.properties.pointType==='stop').properties.name);
  assert.equal(await f.locator('.stop-photo-marker').count(),5);
  await f.locator('#status-card-toggle').click();assert.equal(await f.locator('#status-card-toggle').getAttribute('aria-expanded'),'true');assert(await f.locator('#tourist-observation').isVisible());
  assert(await f.evaluate(()=>document.getElementById('next-card').getBoundingClientRect().bottom+12<=document.getElementById('map-controls').getBoundingClientRect().top));
  await f.locator('#status-card-toggle').press('Escape');assert.equal(await f.locator('#status-card-toggle').getAttribute('aria-expanded'),'false');
  assert(await f.locator('#eta-value').isVisible());
  await f.evaluate(()=>document.activeElement?.blur());
  if(w===390||w===1440)await page.screenshot({path:output+'/screenshots/'+mode+'-'+w+'-current.png'});
  const rect=await f.evaluate(()=>{let c=document.getElementById('next-card').getBoundingClientRect(),d=document.getElementById('map-controls').getBoundingClientRect();return {cardBottom:c.bottom,dockTop:d.top,dockBottom:d.bottom,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}});
  assert(rect.cardBottom+12<=rect.dockTop,JSON.stringify(rect));assert(rect.dockBottom<=rect.height);assert(!rect.overflow);
  await f.locator('#btn-stops').click();await f.locator('#stops-panel').waitFor({state:'visible'});assert.equal(await f.locator('.arrival-item').count(),5);assert(!(await f.locator('#stop-arrivals-list').innerText()).includes('Parked'));
  await f.locator('.arrival-item').nth(2).focus();
  await f.evaluate(()=>updateGPSStatus());
  assert(await f.locator('.arrival-item').nth(2).evaluate(el=>document.activeElement===el));
  await f.locator('#stops-panel').press('Escape');await page.waitForTimeout(300);assert(await f.evaluate(()=>!document.getElementById('stops-panel').contains(document.activeElement)&&scrollX===0));
  await f.locator('#btn-find-me').click();await f.waitForFunction(()=>userPosition!==null);assert.equal(await f.locator('#btn-find-me').getAttribute('aria-pressed'),'true');
  await f.locator('#btn-find-van').click();assert.equal(await f.evaluate(()=>followVan),true);
  await f.locator('#btn-route').click();assert.equal(await f.evaluate(()=>followVan),false);
  assert.equal(await f.evaluate(()=>fixtureWrites.length),0);
  // Actual Realtime callback -> snapshot -> model -> every rendered surface.
  await f.evaluate(()=>{const at=new Date().toISOString();fixtureSnapshot.position.source_recorded_at=at;fixtureSnapshot.position.speed_kmh=20;fixtureSnapshot.position.movement_state='MOVING';Object.assign(fixtureSnapshot.stop.operational_state,{timestamp:at,currentStop:null,nextStop:4,movement:'MOVING',status:'APPROACHING',etaSeconds:480});fixturePush()});
  await f.waitForFunction(()=>window.publicOperationalStatus?.etaConfidence==='valid');assert((await f.locator('#van-movement-status').textContent()).startsWith('LIVE · On the way to'));
  const movingEta=await f.locator('#eta-value').textContent();assert(movingEta.includes('~8 min'));
  await f.evaluate(()=>{fixtureSnapshot.stop.operational_state.timestamp=new Date(Date.now()-120000).toISOString();fixturePush()});
  await f.waitForFunction(()=>window.publicOperationalStatus?.etaConfidence==='outdated');assert(!(await f.locator('#eta-value').textContent()).includes('~'));
  // Open popup expiry and last-seen marker must be refreshed with the same model.
  await f.evaluate(()=>{const old=new Date().toISOString();fixtureSnapshot.position.source_recorded_at=old;fixtureSnapshot.position.speed_kmh=0;fixtureSnapshot.position.movement_state='STATIONARY';Object.assign(fixtureSnapshot.stop.operational_state,{timestamp:old,status:'PARKED',currentStop:3,nextStop:4,etaSeconds:null});fixturePush()});
  await f.waitForFunction(()=>window.publicOperationalStatus?.currentConfirmed);
  await page.clock.fastForward(120000);
  await f.waitForFunction(()=>window.publicOperationalStatus?.gps==='delayed');
  await f.evaluate(()=>stopRecords.find(s=>String(s.feature.properties.stopNumber)==='3').layer.openPopup());
  assert((await f.locator('.leaflet-popup-content').innerText()).includes('Last seen'));
  assert(await f.locator('.tourist-last-seen').count());assert(!(await f.locator('#next-card').innerText()).includes('Parked'));
  if(w===390||w===1440){await f.evaluate(()=>map.closePopup());await page.screenshot({path:output+'/screenshots/'+mode+'-'+w+'-delayed.png'});}
  if(w===390&&mode==='standalone'){
   // Expiry timer, with no fresh transport, still updates the UI.
   await page.clock.fastForward(181000);
   await f.waitForFunction(()=>window.publicOperationalStatus?.gps==='unavailable',null,{timeout:6500});
   assert.equal(await f.locator('#van-movement-status').textContent(),'Live location temporarily unavailable');
  }
  results.push({mode,w,h,...rect,movingEta,mutations:await f.evaluate(()=>fixtureWrites.length)});
 }
 // Origin/source handshake and bridge values, driven by exact same projection.
 await page.goto('http://127.0.0.1:4201/host?w=390&h=600');const f=await(await page.locator('iframe').elementHandle()).contentFrame();await f.waitForFunction(()=>window.publicOperationalStatus?.currentStop);
 await f.evaluate(()=>{window.bridgeMessages=[];window.parent.postMessage;});
 // Production allowlist doesn't allow localhost: verify unknown-origin handshake cannot emit GPS state.
 await page.evaluate(()=>{window.received=[];window.addEventListener('message',e=>received.push(e.data));document.querySelector('iframe').contentWindow.postMessage({type:'shkodra:request-journey'},location.origin)});
 await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>received.filter(x=>x.type==='shkodra:journey').length),0);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(output+'/full-page-browser.json',JSON.stringify({result:'PASS',results,pageErrors:errors,localRequests:sent.length,externalRequestsSent:0,blocked,limits:['Chrome emulation, synthetic service transport; physical devices and production backend not tested','Tiles blocked, published photo fixtures used','Schedule cross-origin integration deferred']},null,2));
 console.log('PASS '+results.length+' full-page standalone/iframe layouts, real four-button controls, shared Realtime projection, ETA/last-seen expiry, keyboard Details, marker art and zero service mutations');
 }finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
