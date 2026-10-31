/* eslint-disable @typescript-eslint/no-require-imports -- Node-only paired acceptance runner with companion CommonJS fixtures. */
/* Paired actual Next.js + canonical Live Map; transport/assets only are synthetic. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const companion=path.resolve(__dirname,'..');
const {chromium}=require(path.join(companion,'node_modules/playwright-core'));
const output=path.join(companion,'reports/companion-20261031'),leaflet=path.dirname(require.resolve(path.join(companion,'node_modules/leaflet/dist/leaflet.js')));
const mapData=require(path.join(companion,'tests/fixtures/published-map-106.json')).map_data,photos=require(path.join(companion,'tests/fixtures/stop-photos/manifest.json'));
const turfFile=path.join(companion,'tests/fixtures/turf-7.3.5.min.js');
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

 for(const [w,h] of [[390,844],[1440,900]]){
 await page.setViewportSize({width:w,height:h});const f=await open('/route');await activate(f);
 for(let i=0;i<4;i++){await page.clock.fastForward(10000);await fresh(f)}
 await f.locator('#btn-find-van').click();assert.equal(await f.evaluate(()=>followVan),true);
 const stop=await page.evaluate(()=>fixtureMessages.at(-1).data.embeddedDisplay.stops[0]);
 assert.notEqual(await f.evaluate(()=>String(publicOperationalStatus.currentStop?.number)),stop.number);
 // Rejected commands cannot change either follow mode or popup selection.
 for(const data of [{version:'1',id:stop.id},{version:2,id:stop.id},{version:1,id:1},{version:1,id:'missing'}]){
 await page.evaluate(data=>document.querySelector('iframe').contentWindow.postMessage({type:'shkodra:select-stop',...data},'http://127.0.0.1:4199'),data);await page.clock.runFor(50);assert.equal(await f.evaluate(()=>followVan),true);
 }
 await panel().locator('button').first().click();await f.waitForFunction(()=>followVan===false);await page.clock.runFor(1000);assert.equal(await f.evaluate(()=>followVan),false);
 for(let i=0;i<3;i++){await page.clock.fastForward(5000);await fresh(f);await page.clock.runFor(500);assert.equal(await f.evaluate(()=>followVan),false);assert((await f.locator('.leaflet-popup').innerText()).includes(stop.name));}
 const geometry=await f.locator('.leaflet-popup').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight}});
 assert(geometry.x>=0&&geometry.y>=0&&geometry.right<=geometry.w&&geometry.bottom<=geometry.h,JSON.stringify(geometry));
 await page.screenshot({path:output+'/paired-stop-'+w+'.png'});
 await f.locator('#btn-find-van').click();assert.equal(await f.evaluate(()=>followVan),true);await fresh(f);await page.clock.runFor(1000);assert.equal(await f.evaluate(()=>followVan),true);
 assert.deepEqual(await f.evaluate(()=>fixtureWrites),[]);results.push({w,h,stop:stop.id,normalRenders:3,popup:geometry,findVanResumes:true});
 }
 for(const suffix of ['', '?embed=1&websiteStatus=external-v1']){
 await page.goto('http://127.0.0.1:4199/live-map.html'+suffix);await page.waitForFunction(()=>window.publicOperationalStatus);assert(await page.locator('#next-card').isVisible());
 await page.locator('#btn-find-van').click();assert.equal(await page.evaluate(()=>followVan),true);
 await page.locator('#tourist-timeline button').first().click();await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>followVan),false);assert(await page.locator('.leaflet-popup').isVisible());
 await page.clock.fastForward(10000);assert(await page.locator('.leaflet-popup').isVisible());await page.locator('#btn-find-van').click();assert.equal(await page.evaluate(()=>followVan),true);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(output+'/paired-stop.json',JSON.stringify({result:'PASS',parent:'SightseeingShkodra-Web-App',results,errors,sent,blocked,limitations:['Controlled transport, synthetic observations, offline tiles; no physical-device or hosted acceptance']},null,2));console.log('PASS paired stop selection mobile, desktop, tracking renders, Find Van, invalid commands and standalone');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
