/* Static checks suitable for this unbundled JS app; no inferred historical ESLint config. */
const current=require('../runtime/current-release.json').frontend;const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const p of [...files(current+'/js'),...files('tools'),...files('tests')].filter(p=>/\.(js|cjs)$/.test(p))){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
for(const p of files(current+'/css')){const s=fs.readFileSync(p,'utf8');assert.equal((s.match(/\{/g)||[]).length,(s.match(/\}/g)||[]).length,p);assert(!s.includes('\uFFFD'),p);}
for(const source of [current])for(const n of ['index.html','live-map.html']){const s=fs.readFileSync(source+'/'+n,'utf8');for(const m of s.matchAll(/(?:src|href)="((?:js|css|assets|icons)\/[^"?#]+)(?:[^" ]*)"/g))assert(fs.existsSync(source+'/'+m[1]),n+': '+m[1]);}
console.log('PASS JS/CJS syntax, CSS structure/encoding and local HTML asset references.');
