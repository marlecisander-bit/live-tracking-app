# Sightseeing Shkodra — reconstructed production baseline

This is a **reconstructed production baseline**, descended from GitHub master `50368beb8ad170987c83e2623a2b2f19a0715f27`, using verified Netlify deployment `6adde7b56701005a9f6facc9` plus the owner-approved circular stop-photo design. It is not a recovery claim for the original historical source/build commit.

`frontend/` is the only canonical static application source. It contains 112 files: 100 production files unchanged, eight approved replacements, and four new stop-design assets. `backend/functions/` contains the eight downloaded production source files, unchanged. No RC2, runtime SDK substitution, proxy, alternate processor or unactivated optimization package is included.

The worktree was created without checking out the old root layout. No original workspace files were deleted or moved. The parent commit retains the old GitHub tree; the reconstruction branch uses the explicit frontend/backend layout instead. This is source reconciliation in a new branch, not cleanup of the original working directory. No commit is pushed or deployed by this project.

## Local workflow

Use Node 24 and npm with the committed lockfile:

```sh
npm ci --ignore-scripts
npm run lint
npm test
npm run typecheck
npm run build
npm run test:browser
```

`npm run build` verifies all approved runtime hashes and copies only the frozen frontend to `dist/`. It does not regenerate public configuration, bundle backend functions or deploy. Builds can repeat safely; unexpected output files cause a failure instead of deletion. There is no deploy script.

Browser tests require installed Chrome (default `BROWSER_CHANNEL=chrome`) or another supported installed channel. No browser is downloaded by npm installation. Tests use real Leaflet, captured copies of the existing stop photographs, synthetic state, mocked administrator transport and a local SQL fixture. External HTTP is blocked. Live map tiles are absent in offline screenshots.

`npm run serve` serves the static map at `http://127.0.0.1:4199/live-map.html` (`PORT` can override). The preserved public config points at the existing production read services. Development validation uses synthetic tests; no production admin login/save is part of this workflow. There is no proxy or development credential injection.

Explicit network checks, not part of offline tests:

```sh
npm run check:platform
npm run test:hosted
```

The first performs one public GET compatibility read. The second previews local candidate bytes through browser-only interception on the current map origin and real Route page. It allows known GET/HEAD traffic and the existing read-only Realtime origin; non-read HTTP/unknown origins are blocked. It does not publish the intercepted bytes or edit public data.

## Entry points and boundaries

- Public map: `frontend/live-map.html`.
- Existing admin: `frontend/index.html`.
- Existing state reader, authoritative ETA and five-second server scheduling are retained.
- Stop content uses existing GeoJSON properties. Name/number remain authoritative; new `photoUrl`/`color` fields use the same Save Draft → Publish path. Legacy appearance defaults are a fallback, not another editable stop database. No new stop-photo upload/storage infrastructure is added.
- Root `netlify.toml` is a portable **proposal**, not a live setting change. It retains deployed cache/MIME declarations and the unchanged CSP file, publishes `dist`, and does not package Supabase functions.
- Backend Edge SDK imports remain exactly as downloaded. `esm.sh/@supabase/supabase-js@2` is floating; its historical resolved closure is not recovered. Backend redeployment/build reproduction remains blocked pending separate closure review. Static frontend build and local contract tests do not depend on resolving that import.
- Historical applied migrations under `provenance/applied-migration-sources/` match 19 existing ledger checksums. They are evidence only; no script applies them. Unactivated A/B/C/D packages are excluded.

See [final decision](reports/FINAL-GO-NOGO.md), [production parity](reports/PRODUCTION-PARITY.md), [dependencies](reports/DEPENDENCIES-AND-BUILD.md), [test reconciliation](reports/RC1-TEST-RECONCILIATION.md), [stop acceptance](reports/STOP-DESIGN-ACCEPTANCE.md), [provenance](reports/PROVENANCE-FINDINGS.md) and [cleanup proposal](reports/SAFE-CLEANUP-PROPOSAL.md).

No push, merge, Netlify/Vercel deployment, production migration/configuration change, reset, prune, deletion or obsolete-folder archiving is authorized or performed. Remote actions and cleanup require separate owner approval.
