/* Local developer diagnostics only; no tourist-facing technical labels. */
(function(){
 window.liveTrackingDiagnostics=function(){var p=typeof canonicalLivePosition!=='undefined'?canonicalLivePosition:null;return {
 provider:p?.source,realtime:typeof supabaseClient!=='undefined'?supabaseClient.getChannels().map(c=>({topic:c.topic,state:c.state})):[],
 providerTime:p?.source_recorded_at,receivedTime:p?.received_at,ageSeconds:p?(Date.now()-Date.parse(p.source_recorded_at))/1000:null,
 quality:typeof publicGpsQuality!=='undefined'?publicGpsQuality:null,speed:p?.speed_kmh,
 state:window.trackingState.describe(p,{quality:publicGpsQuality,atStop:publicUiArrival?.phase==='at_stop',approaching:publicUiArrival?.phase==='approaching',origin:publicUiArrival?.stop?.number==='1'}),phase:typeof publicUiArrival!=='undefined'?publicUiArrival?.phase:null,
 currentStop:typeof vehicleStopState!=='undefined'?vehicleStopState?.current_stop_number:null,nextStop:typeof vehicleStopState!=='undefined'?vehicleStopState?.expected_next_stop_number:null,
 segment:typeof currentOperationalLegIndex!=='undefined'?currentOperationalLegIndex:null,
 backendEta:typeof vehicleEtaState!=='undefined'?{raw:vehicleEtaState?.eta_minutes,progress:vehicleEtaState?.progress_percent}:null,
 motion:typeof publicMarkerController!=='undefined'?publicMarkerController?.inspect():null,
 eta:window.liveEtaDiagnostics||null,transport:window.selectedTracking?.metrics
 };};
 if(!['localhost','127.0.0.1'].includes(location.hostname)||new URLSearchParams(location.search).get('debug')!=='tracking')return;
 const panel=document.createElement('details'),title=document.createElement('summary'),pre=document.createElement('pre');title.textContent='Tracking diagnostics (local only)';panel.append(title,pre);document.body.append(panel);panel.style.cssText='position:fixed;top:8px;left:8px;z-index:20000;background:white;color:black;max-height:60vh;max-width:90vw;overflow:auto;padding:8px';setInterval(()=>{if(panel.open)pre.textContent=JSON.stringify(window.liveTrackingDiagnostics(),null,2);},1000);
})();
