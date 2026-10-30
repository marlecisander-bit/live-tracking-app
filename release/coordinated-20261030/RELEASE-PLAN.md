# Coordinated release candidate — 30 October 2026

Publication is authorized by the owner's attached request; execution remains conditional on passing gates. No production application mutation has occurred in preparation. SQL inspection used READ ONLY transactions (the dashboard created a private query snippet automatically).

## Exact source boundary

Map candidate is this clean repository on release/coordinated-20261030, reconstructed from verified master 476e9c1f43401716778a2d7bf64f3e64aa9f8357 after the old worktree's administrative directory/index could not be recovered. No HEAD/index was fabricated. Source transfer is hash-inventoried. Active frontend/preview/build is frontend/ → dist/ only. Current managed worker source is supabase/functions/gps-worker; backend/ and archives/ are explicitly historical. Supabase is an independent deployment boundary; normal npm/Netlify commands never apply SQL or deploy functions.

Website candidate is the distinct ../SightseeingShkodra-Web-App-canonical repository, release/coordinated-20261030, based on remote main 1f87febdcb9d7f23e8c5fc180dcce195b990feeb. Only bridge projection/metadata validation, three regression tests, the Zod development lock entry and this release documentation belong to it. Original dirty website and broken map workspaces remain preserved at their original paths.

## Verified automatic publication boundary

Netlify API: existing site 3a9f7e87-0504-4b1a-b851-c6f155c12d31, production branch master; allowed branch builds [master]. Feature push may cause a static PR preview, but must not merge/publish master before gates. Existing root Netlify build is static-only and has no migration/deploy command. Current artifact 6ae477c56dcd18f595bc0b18 is ready/manual, commit_ref null.

Vercel dashboard: current deployment 381e774NwX34BWS1jjuSaViK6Y3f, Ready, main commit 1f87febdcb9d7f23e8c5fc180dcce195b990feeb, existing sightseeingshkodra.app/.com domains. Node 24; normal Next build, no output override. Ignored Build Step is "Only build production" with VERCEL_ENV guard. Feature Preview is not a configured staging environment and must not receive production credentials. GitHub branch main push triggers Project CI and production deployment; both feature branches must use PRs, never force push. No branch protections were observed, so our explicit gates still apply.

## Migration review and recovery

Actual managed PostgreSQL 17.11 function bodies tracking_claim, tracking_commit, binding_changed and publish_current were captured through the authorized SQL UI and match the inspected baseline after whitespace normalization. ACLs restrict claim/commit to service_role; private functions remain private. Scheduler identities/MD5s and Realtime publication match recorded baseline. Latest sampled 15-minute cron/HTTP windows each contain 179 successes and zero failed/non-200/timeouts; this does not resolve historical 503 causation.

004_recovery_floor.sql changes three existing functions only, in one transaction with lock/statement deadlines. It adds no table, column, checkpoint or tracking history and does not alter worker/provider/cron/settings. Native local PostgreSQL 17.10 tests against captured managed definitions pass recovery floors, stale rejection, monotonic revisions, invalidation, two-session claim serialization and anon/auth/service-role authorization. Captured function rollback and reapply pass with identical table/column inventory. artifacts.json freezes exact SQL/rollback/static hashes.

If a migration failure rolls back its transaction, confirm old function digests and health. If a committed correction demonstrably fails acceptance, use migration-rollback.sql to restore precisely the three captured definitions in one transaction, verify original ACLs/digests and worker health. This rollback reinstates the known recovery defects; use only as incident recovery, never pretend those defects are fixed. Do not restore/delete current GPS rows or infer lost journey continuity.

## Dependency-safe production sequence (NOT EXECUTED)

1. Freeze candidate source commits, static manifest/ZIP and SQL/rollback hashes in the shared manifest; rerun remote drift checks. Require clean local checks and green PR CI. Verify intended LIVE_MAP Production bindings. The owner has specifically authorized replacing only LIVE_MAP_SUPABASE_URL and LIVE_MAP_PUBLISHABLE_KEY with the already-existing dmqdiazosamyrnkmbtcd public connection if needed; old write-only values are not recoverable, so disclose this configuration rollback limitation before any replacement.
2. Require actual hosted Route/standalone/iframe acceptance and usable browser responsive/keyboard/recovery checks. Do not infer PASS from local fixtures, initial skeletons or HTTP 200. Never inject synthetic production GPS or create real bookings/customer messages.
3. Immediately before the first application production mutation, refresh scheduler/worker/public-map identity and bounded health; stop on active unexplained failures. Apply only 004_recovery_floor.sql to dmqdiazosamyrnkmbtcd after review. Confirm new digests/ACLs and unchanged tables, cron, provider and natural monotonic source/revision/Realtime behavior.
4. Publish the reviewed static map candidate through the existing Netlify PR/release process, verifying the exact 122-file manifest and no function/edge payload. Only then publish the compatible website PR through normal main/Vercel CI. Verify each completed step before starting the next. Apply the two explicitly authorized LIVE_MAP binding replacements only as a recorded step tied to the website production build, with no other environment edits.
5. Complete actual final hosted acceptance and sustained bounded processing/Realtime health on exact deployment versions. A necessary regression triggers supported restoration of the prior ready Netlify deployment 6ae477c56dcd18f595bc0b18 and/or Vercel prior Ready deployment 381e774NwX34BWS1jjuSaViK6Y3f, after rechecking identity and chooser eligibility. Each application rollback is independent of SQL; a frontend rollback does not restore data or undo a function migration. No unrelated settings/data rollback.

## Gates still open

Actual current Route iframe remains blank/about:blank while its DOM src is the correct Netlify URL and both HEAD endpoints return 200; surrounding published stops are unavailable. No JavaScript console error was captured. This is an observed acceptance failure with unconfirmed cause, not proof of a server-binding cause. Browser viewport override has not changed Route innerWidth (1710); mobile acceptance cannot be claimed. Historical log UI retrieval is still being investigated. Independent parking and physical-device/provider accuracy remain limited by existing evidence.

Until these gates pass, hold SQL/environment writes, master/main merges and production deployment. Independent preparation/PR validation may continue. No duplicate generic confirmation is required; the blocker is evidence, not missing general publication authority.
