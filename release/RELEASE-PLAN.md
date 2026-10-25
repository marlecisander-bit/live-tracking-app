# Controlled frontend release — 25 October 2026

Owner-authorized content: reconstructed commit `2ef7bf1f4fad6b587c872826961245b4115f5ac0`, preserving Netlify `6adde7b56701005a9f6facc9`, plus exactly the previously approved 12 stop-design paths. This release branch adds release documentation and stricter synthetic draft/publish/cancel/auth acceptance; no additional runtime feature is introduced.

`frontend-manifest.json` freezes the exact 112 static files. The 100 unchanged production files and eight backend sources must match the baseline. Backend functions are never built or deployed; no migrations, RLS/auth/configuration or five-second scheduler changes are made. Current historical SDK closure limitations remain; this release is frontend-only.

## Verified push boundary

The repository's default/production branch is master. Netlify allows branch deploys only for master; release/production-20261025 is not that branch. No GitHub Actions workflow or ordinary repository webhook was present. Netlify GitHub App integration is present. A pull request may create a preview build; the reviewed root command only validates/copies frontend to dist, runs local tests and one public read-only compatibility check. There is no netlify/functions or edge-function payload, Supabase deployment tool, migration executor or deployment script in this branch. Plugins are empty. Master must not be merged until actual preview output/scope and release gates are verified.

## Validation

Lockfile install, lint, frontend/unit/current RC1/worker-contract/local SQL tests, typecheck and frozen build are required. Browser tests include all requested widths, photo/color/number/popup/list/focus/layout/freshness checks and real admin save/draft/publish/cancel/auth serialization using mocked transport only. Explicit hosted checks use guarded read-only local response interception. This does not certify a physical phone, real GPS/geolocation accuracy, or a production admin write; those writes are intentionally prohibited and are not required for this unchanged authentication boundary.

## Deployment and rollback

Only the frozen static artifact may publish. Actual build preview inventory and available/required function arrays must be verified before using any automatic production path. If that guarantee cannot be established, stop before merging; a supported exact file-digest draft/publish mechanism may be used only within the same verified static-only boundary. No root-directory indiscriminate upload.

The retained ready deployment `6adde7b56701005a9f6facc9` and a freshly recovered 108-file artifact are the rollback target. On a mandatory post-release frontend failure, owner authorization permits restoring that exact deployment through Netlify's site/deploy restore API, with site/account/source identity rechecked. It is frontend-only and does not undo data or backend state. No rollback is invoked without a verified failure trigger.

After a successful production check, document the actual source/deploy IDs, canonical location and rollback. Use a normal history-preserving PR merge; no force push. All archive targets remain untouched until individually approved by exact path. The owner has indicated paths will be supplied; none is currently individually approved.
