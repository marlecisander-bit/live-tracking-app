const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{root,source,files,config}=require('./check-current.cjs');
const output=path.resolve(root,config.output);assert(output.startsWith(root+path.sep)&&output!==source,'Unsafe build output');
function parents(p){for(let n=p;n!==root;n=path.dirname(n)){assert(n.startsWith(root+path.sep));if(fs.existsSync(n))assert(!fs.lstatSync(n).isSymbolicLink(),'Output symlink')}}
parents(output);
function inspect(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);assert(!e.isSymbolicLink(),'Output symlink');if(e.isDirectory())inspect(p);else assert(files.includes(path.relative(output,p)),'Unexpected output; preserve and review: '+p)}}inspect(output);
for(const file of files){const target=path.join(output,file);parents(target);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,file),target);assert(fs.readFileSync(target).equals(fs.readFileSync(path.join(source,file))),file)}
console.log('Built '+files.length+' exact current static files in '+config.output+'; historical dist preserved; no backend packaging');
