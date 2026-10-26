/* Release boundary: reject extra/mutated runtime, backend and hosting files. No hosted calls. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const source=process.cwd(),target=fs.mkdtempSync('/tmp/shkodra-release-guard-'),manifest=require('../release/tourist-information-20261026.json');
for(const n of [...manifest.files.map(f=>'frontend/'+f.path),...manifest.backend.map(f=>'backend/functions/'+f.path),'netlify.toml','release/tourist-information-20261026.json','tools/check-tourist-release.cjs']){const p=path.join(target,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(source,n),p)}
const run=()=>spawnSync(process.execPath,[target+'/tools/check-tourist-release.cjs'],{cwd:target,encoding:'utf8'}).status;
assert.equal(run(),0);let rejected=0;
for(const n of ['frontend/css/live-map/tourist-card.css','backend/functions/_shared/stop-transition.ts','netlify.toml']){const p=target+'/'+n,b=fs.readFileSync(p);fs.appendFileSync(p,'\n/* unauthorized change */\n');assert.notEqual(run(),0);rejected++;fs.writeFileSync(p,b)}
fs.writeFileSync(target+'/frontend/unexpected.js','');assert.notEqual(run(),0);rejected++;
console.log('PASS immutable release baseline and '+rejected+' tamper/extra-file rejection cases; no backend calls');
