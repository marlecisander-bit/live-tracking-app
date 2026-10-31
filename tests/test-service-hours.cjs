const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{PGlite}=require('@electric-sql/pglite');
const scope={Intl,Date,Map,WeakMap,console};vm.createContext(scope);vm.runInContext(fs.readFileSync('frontend/js/shared/service-hours.js','utf8'),scope);const hours=scope.serviceHours;
const week=Array.from({length:7},()=>({open:'09:00',close:'18:00'}));const row={enabled:true,time_zone:'Europe/Tirane',week};
(async()=>{
 assert(hours.valid(week));assert(!hours.valid(week.slice(1)));assert(!hours.valid(week.map(()=>({open:'09:00',close:'09:00'}))));
 for(const [date,open] of [['2026-10-31T07:59:00Z',false],['2026-10-31T08:00:00Z',true],['2026-10-31T16:59:59Z',true],['2026-10-31T17:00:00Z',false],['2026-07-01T07:00:00Z',true]])assert.equal(hours.evaluate(row,Date.parse(date)).open,open,date);
 const night={...row,week:[null,null,null,null,{open:'22:00',close:'02:00'},null,null]};assert(hours.evaluate(night,Date.parse('2026-10-31T00:30:00Z')).open);assert(!hours.evaluate(night,Date.parse('2026-10-31T01:00:00Z')).open);
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const f of ['001_tracking.sql','004_recovery_floor.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 // Managed projects can grant new public tables broad defaults. RLS does not gate TRUNCATE.
 await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role');
 await db.exec(fs.readFileSync('supabase/migrations/005_service_hours.sql','utf8'));
 assert.equal((await db.query("SELECT has_table_privilege('anon','public.vehicle_service_hours','TRUNCATE') v")).rows[0].v,true,'Reproduce permissive managed defaults');
 await db.exec(fs.readFileSync('supabase/migrations/006_service_hours_privileges.sql','utf8'));
 for(const role of ['anon','authenticated','service_role'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) v',[role,'public.vehicle_service_hours',privilege])).rows[0].v,false,role+' '+privilege);

 const project='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';
 await db.query("INSERT INTO projects VALUES($1,'fixture','Fixture',true,'fixture')",[project]);await db.query("INSERT INTO vehicles VALUES('fixture',$1,'Fixture')",[project]);await db.query('INSERT INTO auth.users VALUES($1)',[user]);
 await db.query('INSERT INTO tracking_private.project_admins VALUES($1,$2)',[project,user]);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT save_vehicle_service_hours($1,true,$2)',['fixture',week]),e=>e.code==='42501');await assert.rejects(db.query('SELECT tracking_claim_without_hours($1)',['fixture']),e=>e.code==='42501');
 await db.exec('RESET ROLE; SET ROLE authenticated');await assert.rejects(db.query('SELECT save_vehicle_service_hours($1,true,$2)',['fixture',week]),e=>e.code==='42501');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);await db.query('SELECT save_vehicle_service_hours($1,true,$2)',['fixture',week]);
 await assert.rejects(db.query("UPDATE vehicle_service_hours SET enabled=false"),e=>e.code==='42501');await db.exec('RESET ROLE');
 for(const date of ['2026-10-31T07:59:00Z','2026-10-31T08:00:00Z','2026-10-31T17:00:00Z','2026-07-01T07:00:00Z'])assert.equal((await db.query('SELECT tracking_private.service_is_open($1,$2) v',['fixture',date])).rows[0].v,hours.evaluate(row,Date.parse(date)).open);
 await db.query("UPDATE vehicle_service_hours SET week=$1",[night.week]);assert.equal((await db.query('SELECT tracking_private.service_is_open($1,$2) v',['fixture','2026-10-31T00:30:00Z'])).rows[0].v,true);
 await db.query('UPDATE vehicle_service_hours SET week=$1',[Array(7).fill(null)]);
 const before=await db.query('SELECT * FROM tracking_private.runtime');await db.exec('SET ROLE service_role');assert.deepEqual((await db.query("SELECT tracking_claim('fixture') v")).rows[0].v,{serviceClosed:true});assert.equal((await db.query("SELECT tracking_commit('fixture',0,gen_random_uuid(),1,'{}') v")).rows[0].v,'outside_operating_hours');await db.exec('RESET ROLE');assert.deepEqual((await db.query('SELECT * FROM tracking_private.runtime')).rows,before.rows);assert.equal((await db.query('SELECT count(*) n FROM tracking_live_snapshots')).rows[0].n,0);
 // A boundary detected by the row guard aborts all enclosed claim writes.
 await db.exec("SELECT set_config('tracking.enforce_hours','on',false)");await assert.rejects(db.query("INSERT INTO tracking_private.runtime(vehicle_id) VALUES('fixture')"),e=>e.code==='PST01');
 await db.exec("SELECT set_config('tracking.enforce_hours','off',false); UPDATE vehicle_service_hours SET enabled=false");assert.equal((await db.query("SELECT tracking_private.service_is_open('fixture') v")).rows[0].v,true);
 // Re-check commit after hours change while a real lease is outstanding.
 await db.query("INSERT INTO map_versions(project_id,status,map_data,published_at) VALUES($1,'published',$2,clock_timestamp())",[project,require('./fixtures/published-map-106.json').map_data]);
 await db.exec("INSERT INTO tracking_private.bindings VALUES('fixture','fixture','SCORPION_TOKEN_FIXTURE',true)");
 const claimed=(await db.query("SELECT tracking_claim('fixture') v")).rows[0].v;assert(claimed.lease);
 await db.exec('UPDATE vehicle_service_hours SET enabled=true');
 const leased=(await db.query('SELECT * FROM tracking_private.runtime')).rows;
 assert.equal((await db.query("SELECT tracking_commit('fixture',$1,$2,$3,'{}') v",[claimed.runtime.revision,claimed.lease,claimed.mapVersion.id])).rows[0].v,'outside_operating_hours');
 assert.deepEqual((await db.query('SELECT * FROM tracking_private.runtime')).rows,leased);
 await db.query('UPDATE vehicle_service_hours SET week=$1',[week]);
 assert.equal((await db.query('SELECT tracking_private.service_closes_at($1,$2) v',['fixture','2026-10-31T08:00:00Z'])).rows[0].v.toISOString(),'2026-10-31T17:00:00.000Z');
 console.log('PASS explicit read-only table ACL under broad managed defaults, admin RPC writes, weekly schedule, Tirane/DST, overnight/boundaries, admin authorization, closed claim/commit with zero GPS rows, write guard, disabled compatibility');
 }finally{await db.close();}
 const {createHandler}=await import('../supabase/functions/gps-worker/handler.ts');let calls=[];const handler=createHandler({env:name=>({TRACKING_PROCESSOR_SECRET:'s'.repeat(32),SUPABASE_URL:'https://fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture'})[name],fetcher:async url=>{calls.push(url);return new Response(JSON.stringify({serviceClosed:true}));}});const response=await handler(new Request('https://worker',{method:'POST',headers:{'x-tracking-secret':'s'.repeat(32)},body:JSON.stringify({vehicle_id:'fixture'})}));assert.equal(response.status,200);assert.equal((await response.json()).reason,'outside_operating_hours');assert.equal(calls.length,1);assert(calls[0].endsWith('/tracking_claim'));const closedDuringClaim=createHandler({now:()=>Date.parse('2026-10-31T17:00:01Z'),env:name=>({TRACKING_PROCESSOR_SECRET:'s'.repeat(32),SUPABASE_URL:'https://fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture'})[name],fetcher:async()=>new Response(JSON.stringify({serviceClosesAt:'2026-10-31T17:00:00Z'}))});
 const atClose=await closedDuringClaim(new Request('https://worker',{method:'POST',headers:{'x-tracking-secret':'s'.repeat(32)},body:JSON.stringify({vehicle_id:'fixture'})}));assert.equal(atClose.status,200);assert.equal((await atClose.json()).reason,'outside_operating_hours');
 console.log('PASS actual worker exits before credential/provider fetch/commit when closed');
})().catch(e=>{console.error(e);process.exitCode=1;});
