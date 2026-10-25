# Reconstructed baseline — final decision

**GO for the approved local reconstructed frontend/backend-source baseline. NO-GO for push, merge, deployment or cleanup: none is authorized. Full historical Edge SDK build reproduction/backend redeployment remains BLOCKED pending separately reviewed closure evidence.**

Location: `/private/tmp/shkodra-reconstructed-production-20261025`.

Branch: `reconcile/production-20261025`, descended from existing GitHub master `50368beb8ad170987c83e2623a2b2f19a0715f27`. This is explicitly a reconstructed production baseline, not a recovered original historical commit/build. The canonical runtime comes from selected `production-plus-stops.zip`; no unrelated unpublished runtime entered it.

## Local validation gates

| Gate | Result and evidence |
| --- | --- |
| Production parity except approved stops | PASS: 100 original deployed files identical, exactly 12 approved paths, 112 total frontend files |
| Backend source unchanged | PASS: eight source hashes and function-version evidence match baseline |
| Current RC1 tests | PASS: 14 independent contract cases plus departure/dwell/delay/repeated-loop replay |
| Admin fields synchronized | PASS: real editor save handler/serializer with mocked transport → marker, popup and list; no hosted write |
| Standalone mobile | PASS: 320/375/390/430 fixture checks plus full-app read-only preview |
| Iframe | PASS: synthetic parent bounds/scroll and real public Route parent preview |
| Four navigation commands | PASS: unchanged handler bytes and synthetic dispatch/follow/panel/focus checks; physical geolocation not certified |
| No unauthorized calls/writes in tests | PASS: offline external-request guards and mocked writes; explicit hosted preview only allowlisted read traffic/Realtime, zero production writes |
| Rollback intact | PASS: original workspace/archive hashes preserved; no existing archive moved or overwritten |
| No unrelated candidate runtime | PASS: strict source allowlist/hash checks; no RC2, SDK replacement, central processor, proxy or unactivated A/B/C/D package |

Lockfile installation, static lint/syntax/reference checks, planner typecheck, unit/worker tests, local SQL integration and production static build passed. The root portable Netlify config is a documented proposal; existing live settings and five-second schedules are unchanged. Generated reports contain the test outputs; curated screenshots are linked from STOP-DESIGN-ACCEPTANCE.md.

## Boundaries that remain

Historical source/build provenance and the deployed floating SDK closure are not claimed recovered. The current wrapper resolves to SDK 2.118.0, which does not prove the deployed v20 bundle used that resolution. Source remains untouched and no backend packaging/deploy script is introduced. Full auth/Vault/platform restoration and physical-phone/driving acceptance remain outside the demonstrated evidence.

The old GitHub layout was never checked out into this new worktree. Its source remains in parent history and the untouched original workspace; this branch uses the explicit canonical layout. This is not cleanup or deletion of old local developments. A normal local reconstruction commit may seal this branch; no history is rewritten or remote ref changed. The separate owner receipt records the resulting local commit and review paths.

## Next actions require separate authorization

- Any remote GitHub push/PR/merge or Netlify/Vercel publication.
- Any selected archive/quarantine operation from the exact cleanup proposal.
- Any backend SDK pin/substitution, Edge rebuild/deployment, schema/RLS/auth/configuration change, scheduler/retention/optimization activation or real production test write.

No further approval is needed to inspect or use the prepared local workflow. The original working directory, active branch, rollback files and production infrastructure remain unchanged.
