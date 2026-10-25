// Marker/display utilities only; route/ETA decisions are server-owned.
function normalizeAngle(angle){return ((angle%360)+360)%360;}
function recordSpeed(speed){if(Number.isFinite(Number(speed))&&speed>=0&&speed<=80){speedHistory.push(Number(speed));if(speedHistory.length>MAX_SPEED_SAMPLES)speedHistory.shift();}}
