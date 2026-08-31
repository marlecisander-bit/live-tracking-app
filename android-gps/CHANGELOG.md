# Changelog

## 1.1.0 - Vehicle Agent hardening

- Changed active-tour acquisition to a measured 1 Hz high-accuracy stream.
- Added deterministic EXCELLENT/GOOD/FAIR/POOR/STALE quality states.
- Added MOVING/STATIONARY hysteresis and preserved the first valid fix.
- Added speed/bearing accuracy, derived course and heading-source telemetry.
- Added per-constellation used/visible counts, per-band counts and C/N0 summary.
- Added fix rate, TTFF, fix age and monotonic timestamp telemetry.
- Added stable device identity and durable sequence numbers.
- Prioritized the newest live point before draining historical backlog.
- Added exponential upload backoff with jitter and network validation.
- Added battery, external-power, battery-temperature and thermal monitoring.
- Added READY/DEGRADED/OFFLINE/ERROR operational status and permission readiness.
- Replaced fragile boot auto-start with an explicit high-priority Resume notification.
- Added backend live-state-first handling and five-second history sampling.
- Added unit coverage for location quality thresholds.

## Known pilot items

- Device credential is scoped and revocable but still supplied at build time; migrate provisioning to Android Keystore before wider fleet deployment.
- Advanced diagnostics export and field-test CSV/JSON recording remain a later milestone.
- Complete-route screen-off, thermal, reboot and network-loss tests must be performed on the Pixel 9a.
