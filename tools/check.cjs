if(require('fs').existsSync(require('path').join(__dirname,'../release/atomic-cms-20261029.json'))){require('./check-atomic-release.cjs')}else{
/* Versioned owner-authorized frontend release; historical gate remains below. */
const releaseFs=require('fs'),releasePath=require('path');
if(releaseFs.existsSync(releasePath.join(__dirname,'../release/tourist-information-20261026.json'))){require('./check-tourist-release.cjs');}else{
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');const root=path.resolve(__dirname,'..'),manifest=require('../manifest.json'),baseline=require('../provenance/production-manifest.json'),approved=require('../provenance/approved-stop-design.json');const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const approvedMap=new Map(approved.map(x=>[x.path,x]));const changed=[];for(const f of baseline.files){const p=path.join(root,'frontend',f.path),hash=sha(fs.readFileSync(p));if(hash!==f.sha256){const a=approvedMap.get(f.path);assert(a,'Unapproved runtime change '+f.path);assert.equal(hash,a.after_sha256,f.path);changed.push(f.path);}}
function list(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert(!e.isSymbolicLink(),'Runtime symlink');const p=path.join(dir,e.name);return e.isDirectory()?list(p):[p];});}
const frontend=list(path.join(root,'frontend'));assert.equal(frontend.length,112);for(const p of frontend){const n=path.relative(path.join(root,'frontend'),p).split(path.sep).join('/');if(!baseline.files.some(f=>f.path===n)){assert(approvedMap.get(n)?.new,'Unapproved additional asset '+n);assert.equal(sha(fs.readFileSync(p)),approvedMap.get(n).after_sha256);changed.push(n);}}
assert.equal(changed.length,12);for(const f of manifest.files){const b=fs.readFileSync(path.join(root,f.path));assert.equal(b.length,f.size,f.path);assert.equal(sha(b),f.sha256,f.path);}
const functions=list(path.join(root,'backend/functions'));assert.equal(functions.length,8);fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/production-parity.json'),JSON.stringify({result:'PASS',frontendFiles:112,approvedChanges:changed,unchangedProductionFiles:100,backendFiles:8,backendUnchanged:true,baseline:'6adde7b56701005a9f6facc9'},null,2));console.log('PASS 100 unchanged deployed files + exactly 12 stop-design paths; eight backend sources unchanged.');

}

}
