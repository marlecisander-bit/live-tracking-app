# Offline browser fixture

`turf-7.3.5.min.js` is the exact existing production vendor URL's bundle, captured for isolated browser testing:
https://cdn.jsdelivr.net/npm/@turf/turf@7.3.5/turf.min.js

SHA-256: `505d3a35da8a8bf1f8aed590cdad0ffa11e70d51f28d0c2359007bafed0fd382`.

Its MIT license is included as `turf-7.3.5.LICENSE`. This is a static test dependency, contains no GPS observations, and is never copied to the frontend artifact. The production vendor URL and version are unchanged. Browser tests intercept requests with this bundle, local Leaflet and synthetic Supabase responses; they send no external service requests.
