# Production parity

Selected baseline: Netlify `6adde7b56701005a9f6facc9`, selected frozen `production-plus-stops.zip` SHA-256 `e20f25264b329ce05eb76850ddc7a8fb235d9db8eea716d06eef479c66f927c9`.

`npm run check:parity` passed: 100 deployed files unchanged, exactly 12 approved stop-design paths (eight replacements/four additions), and eight downloaded backend files byte-identical. `manifest.json`, `provenance/production-manifest.json`, `provenance/approved-stop-design.json`, and `production-parity.json` record the exact paths/hashes. No additional frontend or backend runtime file is permitted by the check.

The status-card/dock stylesheet, four command handlers, original van graphic, state readers, ETA math, source cadence, worker interfaces and existing auth/publishing modules remain unchanged. The only admin implementation additions are appearance fields and their rendering/save into existing stop properties. Current RLS definitions and grants were inspected read-only; no production permission change was issued.

The backend retains RC1's 200 m fallback and existing overrides, guarded origin reset, completion state and skipped-stop recovery. Three active cron jobs (4/5/8) remain five seconds in the captured platform metadata. The obsolete 100 m planner is not in the candidate. Test fixtures were reconciled instead of changing production logic.

The before/after full-app preview at five widths and the real Route iframe passed with five stop records and five photo markers. Static candidate responses were intercepted only in the test browser. This is a local preview, not a deployment or a physical-phone acceptance claim.

Root `netlify.toml` is new portable build tooling and has not been applied to the live site. The historical resolved config remains unchanged in the frozen frontend artifact as evidence. The portable proposal copies seven deployed cache/MIME declarations and retains the original CSP in `_headers`.

Original working-tree content hashes, original branch/HEAD and existing rollback archives were preserved. The new branch changes layout from the old GitHub tree to canonical `frontend/` and `backend/`; that old tree stays accessible through the parent history. No files in the original workspace were moved or deleted.
