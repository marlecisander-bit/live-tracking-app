import { planStopTransition } from "../_shared/stop-transition.ts";

// Bounded scheduled work. PostgreSQL owns serialization, ordering and atomic commit.
export async function processProviderStops(db: any, vehicle: string) {
  let processed=0,events=0;
  for(let attempt=0;attempt<50;attempt++){
    const context=await db.rpc('provider_processing_context',{target_vehicle:vehicle});
    if(context.error) throw new Error(context.error.message);
    if(!context.data) return {ok:true,processed:processed>0,inputs:processed,events};
    const c=context.data;
    const plan=planStopTransition({gps:c.gps,previousGps:c.previous_gps,mapVersion:c.map_version,existingState:c.planner_state,config:c.config});
    if(plan.skipped) throw new Error('Operational input rejected: '+plan.reason);
    const commit=await db.rpc('commit_provider_transition',{point_id:c.gps.id,expected_state:c.state,next_state:plan.state,new_events:plan.events,version_id:c.map_version.id});
    if(commit.error) throw new Error(commit.error.message);
    if(commit.data.status==='processed'){processed++;events+=commit.data.events;}
  }
  return {ok:true,processed:processed>0,inputs:processed,events,remaining:true};
}
