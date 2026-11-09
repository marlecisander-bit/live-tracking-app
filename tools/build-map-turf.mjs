import {build} from 'esbuild';
await build({entryPoints:['tools/map-turf-entry.mjs'],outfile:'frontend/js/vendor/turf.min.js',bundle:true,minify:true,format:'iife',target:['safari16.4','chrome110'],legalComments:'inline',banner:{js:'/* Turf 7.3.5, MIT. Selected map geometry functions only. */'}});
