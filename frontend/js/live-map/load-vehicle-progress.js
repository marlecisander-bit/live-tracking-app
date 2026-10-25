// One normalized backend state. No browser-triggered processing or route inference.
function getNormalizedLiveState(){
 const op=vehicleStopState?.operational_state;
 if(!op||op.version!==3||String(op.mapVersion)!==String(currentPublishedId))return null;
 if(canonicalLivePosition&&String(op.sourceRun)!==String(canonicalLivePosition.source_run_id))return null;
 return op;
}
function findStopRecordByNumber(number){return stopRecords.find(r=>String(r.feature.properties.stopNumber)===String(number))||null;}
function getExpectedNextStopNumber(){const op=getNormalizedLiveState();return op?.nextStop==null?null:String(op.nextStop);}
