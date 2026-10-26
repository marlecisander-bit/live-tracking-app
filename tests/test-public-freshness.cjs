/* Exercise the production expiry entry point; canonical/legacy badges no longer classify independently. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('frontend/js/live-map/track-bus.js','utf8');
const status=source.slice(source.indexOf('function updateGPSStatus()'));
let updates=0,interval;
vm.runInNewContext(status,{updateSmartRouteInformation(){updates++;},setInterval(fn,ms){interval=ms;fn();}});
assert.equal(updates,1);assert.equal(interval,5000);
console.log('PASS public expiry delegates to the unified presenter every five seconds');
