
/*
   Sightseeing Shkodra Live Map
   Build: 2026-08-19 sequence + backend ETA frontend v2.2

   Backend authority:
   - public.vehicle_stop_state -> operational stop sequence
   - public.vehicle_eta_state  -> next-stop ETA / remaining distance / progress

   Frontend route calculations remain available as a safe fallback.
*/


/* ============================================================
   SUPABASE
============================================================ */

const supabaseClient =
    supabase.createClient(
        window.appConfig.supabaseUrl,
        window.appConfig.supabaseKey
    );
