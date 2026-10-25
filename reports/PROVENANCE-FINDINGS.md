# Bounded read-only provenance findings

Selected production identity remains Netlify `6adde7b56701005a9f6facc9`; no deploy/configuration change was made. Six Edge Function versions match the recorded baseline: collector 7, stop-detector 20, segment-analyzer 9, ETA 11, POI search 12, ingest 8. All eight downloaded source files remain byte-identical.

Read-only catalog queries captured 509 public column definitions, 38 RLS policies, 35 routine fingerprints, table grants, RLS enable/force state, relevant auth.uid/role/jwt privileges, extensions and cron settings. All SQL used explicit read-only transactions and bounded statement timeouts. Credential values, auth users, SMTP credentials, Vault contents and migration statement bodies were not requested.

The Supabase CLI migration-schema view initially returned none. Catalog discovery found the existing custom `release_metadata.migrations` ledger. Its 19 file/checksum entries all match available local source bytes. Those historical applied sources are preserved under `provenance/applied-migration-sources/`, as evidence only. No migration or optimization was applied, and no build script can apply them. Managed auth/realtime/storage ledgers were identified but their data was not needed for this app-source compatibility task.

Current RLS/grant definitions and unchanged candidate auth/publishing modules preserve the existing admin boundary. No real administrator login/write was used for testing. Managed auth-provider/email configuration was not exported because it is not needed to preserve these frontend interfaces and could unnecessarily expose credentials.

Three original active jobs (4/5/8) remain five seconds. The snapshot routine still has the original MD5 `2f2c8cd3f52dd2340e002249dbf6119b`; Package A is not activated. Inactive retirement schedules remain inactive. Configured acquisition cadence is not a claim of fresh provider reports every five seconds; no driving/arrival event was induced.

The historical source/build commit remains unknown for the manual artifact; owner-approved reconstruction is explicitly labelled. Current floating SDK resolution is captured for investigation, not substituted into source or represented as the old deployed bundle closure. Complete platform restoration and historical Edge closure remain unproven. Backend redeployment remains blocked until separately reviewed; frontend static build/local validation are established.
