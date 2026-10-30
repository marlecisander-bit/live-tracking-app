process.env.TRACKING_SOURCE = require('../runtime/current-release.json').frontend+'/js/shared/gps-source.js';
require('./test-tracking-stream.cjs');
