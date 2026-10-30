const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),config=require('../runtime/current-release.json'),source=path.resolve(root,config.frontend),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const baselineBytes=fs.readFileSync(path.join(root,config.baselineManifest));assert.equal(sha(baselineBytes),config.baselineManifestSha256,'Pinned production manifest drift');const baseline=JSON.parse(baselineBytes);
function walk(dir){assert(!fs.lstatSync(dir).isSymbolicLink(),'Source symlink');return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);assert(!e.isSymbolicLink(),'Source symlink');return e.isDirectory()?walk(p):[path.relative(source,p)]})}
const files=walk(source).sort();assert.deepEqual(files,baseline.files.map(f=>f.path).sort(),'Unexpected/missing release files');
for(const f of baseline.files)assert.equal(sha(fs.readFileSync(path.join(source,f.path))),config.localOverrides[f.path]||f.sha256,f.path);
for(const f of Object.keys(config.localOverrides))assert(files.includes(f),'Override must name an existing release file');
console.log('PASS pinned '+files.length+'-file current frontend and '+Object.keys(config.localOverrides).length+' reviewed local repair; not deployment authorization');module.exports={root,source,files,config};
