/* Frozen per-file release verification. No runtime regeneration or backend packaging. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),release=require('../release/tourist-information-20261026.json'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink(),'Source symlink');const p=path.join(dir,e.name);return e.isDirectory()?files(p):[p]})}
assert.equal(release.files.length,115);assert.equal(release.changes.length,12);assert.equal(files(path.join(root,'frontend')).length,release.files.length);
for(const f of release.files){const b=fs.readFileSync(path.join(root,'frontend',f.path));assert.equal(b.length,f.size,f.path);assert.equal(sha(b),f.sha256,f.path)}
assert.equal(files(path.join(root,'backend/functions')).length,release.backend.length);
for(const f of release.backend)assert.equal(sha(fs.readFileSync(path.join(root,'backend/functions',f.path))),f.sha256,'Backend reference '+f.path);
assert.equal(sha(fs.readFileSync(path.join(root,'netlify.toml'))),release.rootBuildConfigSHA256,'Root Netlify configuration');
assert.equal(release.backendChanged,false);assert.equal(release.transportChanged,false);assert.equal(release.configChanged,false);
console.log('PASS frozen tourist-information release: 115 frontend files, 12 reviewed runtime paths, unchanged backend/transport/hosting configuration.');
