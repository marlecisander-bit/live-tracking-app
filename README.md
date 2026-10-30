# Sightseeing Shkodra — reconstructed production baseline

This is a **reconstructed production baseline**, descended from GitHub master `50368beb8ad170987c83e2623a2b2f19a0715f27`, using verified Netlify deployment `6adde7b56701005a9f6facc9` plus the owner-approved circular stop-photo design. It is not a recovery claim for the original historical source/build commit.

`frontend/` is the only canonical static application source. It contains 112 files: 100 production files unchanged, eight approved replacements, and four new stop-design assets. `backend/functions/` contains the eight downloaded production source files, unchanged. No RC2, runtime SDK substitution, proxy, alternate processor or unactivated optimization package is included.

The worktree was created without checking out the old root layout. No original workspace files were deleted or moved. The parent commit retains the old GitHub tree; the reconstruction branch uses the explicit frontend/backend layout instead. This is source reconciliation in a new branch, not cleanup of the original working directory. No commit is pushed or deployed by this project.

## Canonical repository and release record

- Repository: https://github.com/marlecisander-bit/live-tracking-app
- Canonical branch: `master` after the reviewed history-preserving merge of [PR #1](https://github.com/marlecisander-bit/live-tracking-app/pull/1).
- Canonical local worktree: `/Users/aleksandermarleci/Desktop/Projects Dev/live-tracking-app-canonical` (established after successful source synchronization).
- Initial accepted frontend publication: `6addff8cf909a17e9c8131a9` at `2026-10-25T13:15:43.291Z`, source `bdd17e34df13baec2b33a064a3623f4046d8bea0`; runtime baseline `2ef7bf1f4fad6b587c872826961245b4115f5ac0`.
- Exact runtime artifact: [release/frontend-manifest.json](release/frontend-manifest.json), 112 files; documentation-only synchronization builds must match these same hashes.
- Immediate prior rollback: `6adde7b56701005a9f6facc9`; the fresh verified rollback is retained outside the deploy artifact.
- The final master source/deploy association is recorded on [PR #1](https://github.com/marlecisander-bit/live-tracking-app/pull/1) and the owner's final release receipt. A later documentation-only Netlify deployment may have a newer ID while retaining the same application artifact.

Start future work from the canonical master worktree. The older `live-tracking-app-master` directory is an untouched legacy/reference workspace with unpublished material; do not build or deploy it. Archive targets remain in place pending individual path approval. Historical reconstruction reports describe earlier states; [release/DEPLOYMENT-RECORD.md](release/DEPLOYMENT-RECORD.md) is the application release record.

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

See [historical reconstruction-phase decision](reports/FINAL-GO-NOGO.md), [production parity](reports/PRODUCTION-PARITY.md), [dependencies](reports/DEPENDENCIES-AND-BUILD.md), [test reconciliation](reports/RC1-TEST-RECONCILIATION.md), [stop acceptance](reports/STOP-DESIGN-ACCEPTANCE.md), [provenance](reports/PROVENANCE-FINDINGS.md) and [cleanup proposal](reports/SAFE-CLEANUP-PROPOSAL.md).

The owner has authorized controlled GitHub synchronization and a static-frontend release, subject to final gates documented in `release/RELEASE-PLAN.md`. No backend rebuild/deploy, SQL/configuration change, native change, destructive cleanup or individually unapproved archival is included. Historical reconstruction-phase reports record the earlier authorization boundary; the release plan and final deployment record supersede that status.

## Coordinated candidate — 30 October 2026

The canonical Live Map source for this candidate is `frontend/`. `runtime/current-release.json` selects it for root preview and build; `npm run build` verifies the pinned deployed baseline plus the explicit deadline repair and produces `dist/`. Netlify publishes `dist/`. No backend is bundled or deployed by these commands. Current worker sources are in `supabase/functions/gps-worker`; legacy `backend/` is retained only for historical regression fixtures.

Use `npm ci --ignore-scripts`, `npm run lint`, `npm test`, `npm run typecheck`, `npm run check:parity`, `npm run build`; `npm run serve` previews the current frontend. `npm run check:platform` is an explicitly read-only production contract check. Native recovery tests use `npm rebuild --offline` followed by `npm run test:native` to hydrate the native PostgreSQL package links; tests use only fictional local data.

Candidate directory: `/Users/aleksandermarleci/Desktop/Projects Dev/live-tracking-app-release`, branch `release/coordinated-20261030`. Website candidate is the separate `../SightseeingShkodra-Web-App-canonical` repository on the matching branch. See `release/coordinated-20261030/RELEASE-PLAN.md` and the shared manifest for current gates. The older broken workspace and its experiments remain preserved at `../live-tracking-app-canonical`; its commands must not be used as a competing release path. `archives/` is inactive. Historical release records are provenance, not current acceptance.
