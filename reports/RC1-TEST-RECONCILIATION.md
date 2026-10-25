# RC1 test reconciliation

Production logic was not edited. Both outdated suites were ported to `backend/functions/` and current verified behavior. Original test text remains under `provenance/original-tests/`.

- The planner suite now has 14 independent scenarios instead of a shared 100 m-era state chain. It tests the 199/201 m boundary, two known-moving observations beyond the 220 m exit threshold, unknown-speed handling, two-fix forward recovery without false completion, guarded two-fix origin reset and interrupted jitter, three repeated loops, ten-minute parking with absent ETA, delayed inputs, duplicate/older rejection, persisted JSON, Stop 5 and per-stop override precedence.
- Departure replay keeps the existing delayed-arrival regression checks, 30-minute dwell, jitter, repeated loops and persisted duplicate rejection. Departure samples move 130 → 260 → 270 m in five-second steps so they satisfy the unchanged 50 m/s jump guard. Origin returns explicitly require two fixes. No worker threshold or timestamp was weakened to satisfy tests.
- Frontend tests cover concurrent shared reads, expiration/session isolation, stream/reconnect/order, freshness and ETA formatting.
- Worker contract checks execute the real entrypoint in a synthetic Deno environment: unauthorized input, missing explicit vehicle and conflicting central-processor flags reject before a client is created; authorized fixture path succeeds. No remote SDK is loaded.
- Integration executes the real provider handler and planner against a local PGlite-backed RPC transport, verifying queue drain/idempotence, persisted completion/skipped recovery, restart and guarded reset. The transport is explicitly a test fixture, not a reconstructed clone of all production RPC locking/RLS behavior.

`npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` passed. Typecheck covers the pure planner. Full Edge SDK closure typing/build reproduction is not claimed; unchanged source/versions/interfaces and bounded platform metadata are preserved instead. Node's experimental stripTypeScriptTypes warning is expected tooling output, not a test failure.

Tests use synthetic data and no hosted writes. Backend source hashes are checked independently before builds. Existing five-second scheduling was read, not changed.
