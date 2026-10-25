# Stop design, admin and responsive acceptance

The approved 12-file stop design is included unchanged. Photo/color resolution, marker/popups/list rendering and Save Draft → Publish remain in the existing GeoJSON model. Names and numbers retain the existing editor/route-order controls. Photo URL/color inputs use existing hosted images and per-stop values; no new image upload service, table or storage permission is added.

Offline Chrome acceptance passed 12 standalone/iframe configurations across 320, 375, 390, 430, 768 and 1440px. Tests cover high/low zoom, collision compaction, selection, popups, tinted scrollable rows, parent scrolling, four command-handler dispatch paths, stale ETA suppression, missing-image fallback and safe input handling. Actual admin savePointObject/draft serialization runs against a mocked transport and is then re-rendered publicly; name, photo URL, color and number agree in marker, popup and list. Real production records are never edited.

The offline harness guards every HTTP request, serves the captured existing-photo fixtures locally, and checks no unexpected external request completes. Map tile requests are aborted; offline screenshots therefore have no live basemap. A separate allowlisted GET/HEAD/Realtime browser-only preview validates the complete candidate at five widths and inside the real public Route page with real tiles. Its source is intercepted locally; nothing is published.

Screenshots:

- [Mobile marker layout](screenshots/after-standalone-390-map.png)
- [Desktop](screenshots/after-standalone-1440-map.png)
- [Operational popup](screenshots/after-standalone-390-popup.png)
- [Tinted Stops list](screenshots/after-standalone-390-panel.png)
- [Compact low zoom](screenshots/after-standalone-lowzoom.png)
- [Iframe](screenshots/after-iframe-390-map.png)
- [Full-app read-only preview](screenshots/hosted-preview-390.png)
- [Real Route iframe preview](screenshots/hosted-preview-route.png)

The original van and colorful dock are unchanged. No attraction descriptions or large tourist panels were added. Existing website palette values are retained; bright-orange/white formal contrast acceptance remains a documented design limitation. Physical iPhone/browser-chrome behavior, real visitor geolocation permissions and authenticated hosted admin persistence are not certified by desktop fixture tests.
