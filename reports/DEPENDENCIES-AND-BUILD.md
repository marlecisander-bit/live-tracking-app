# Dependency and build reconciliation

## Required local tools

Node 24 (`.nvmrc`, package engines), npm and the committed lockfile. Installation was repeated with `npm ci --ignore-scripts --offline` using the prepared npm cache. Application build/check scripts use Node built-ins. No npm lifecycle script, browser download, runtime bundler, SDK replacement or deployment script is needed.

Exact development-only dependencies, established from existing tooling/runtime versions:

| Package | Version | Purpose |
| --- | --- | --- |
| @electric-sql/pglite | 0.5.8 | Isolated local SQL integration |
| leaflet | 1.9.4 | Same-version real Leaflet in offline browser tests |
| playwright-core | 1.62.1 | Installed Chrome automation; no bundled browser installation |
| typescript | 5.9.3 | Pure current planner typecheck |

All four install with lockfile integrity values. These are reconstruction tooling inputs, not a claim about historical deployment dependencies.

## Runtime dependencies and configuration

Frontend HTML retains Leaflet 1.9.4, Supabase JS 2.112.3 and Turf 7.3.5 CDN references. The approved photographs reference the existing website image endpoint; five captured image fixtures are test-only. Tiles remain OpenStreetMap. Public configuration is frozen in `frontend/js/shared/app-config.js`; no build-time credentials or implicit Netlify environment injection is introduced.

Backend source retains its downloaded `https://esm.sh/@supabase/supabase-js@2` imports. The current wrapper resolves to 2.118.0 in the bounded capture; this **does not establish which patch/dependency closure was in the deployed v20 bundle**, and no import was repinned or vendored. Exact historical Edge build reproduction and backend redeployment remain BLOCKED pending separately reviewed closure evidence. This does not prevent the static frontend build or local pure/contract tests.

Host variable names referenced by deployed code include `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRACKING_PROCESSOR_SECRET`, `CENTRAL_PROCESSING_ENABLED`, and binding-specific `SCORPION_TOKEN_*`. Their values were not retrieved or written into source. These are existing hosted backend inputs, not frontend environment variables. Local optional names are `PORT` and `BROWSER_CHANNEL`.

## Build and Netlify proposal

`npm run build` validates the selected source hashes and copies exactly 112 static files. Existing `dist` can be overwritten only at expected paths; unknown files cause failure, not cleanup. No schema, SDK or application configuration is generated. Backend source is not bundled.

Root Netlify proposal publishes `dist`, runs the public read-only v3 compatibility gate and local checks, and carries the current cache/MIME header declarations. `_headers` keeps the authorized iframe ancestors. The dashboard's current repository/master/null-command/dot-publish settings and its resolved Windows-path artifact config are separately recorded; neither was changed. Applying the new portable settings or pushing a deployment branch requires separate approval.

Full backend platform restoration, auth provider/SMTP/secret recovery, a road-test accuracy claim and a historical vendor build closure are outside the established evidence. No missing source or configuration was invented.
