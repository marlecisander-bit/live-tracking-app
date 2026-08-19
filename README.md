# Sightseeing Shkodra Map App

This project has two pages:

- `index.html` is the administration page used to edit and publish the map.
- `live-map.html` is the public map used by visitors.

You can describe changes using normal language, such as “change the stop editor” or “change how bus arrivals are calculated.” This guide shows where each visible feature lives.

## Shared settings

`js/shared/app-config.js` is the only shared JavaScript file. It contains the map center, Supabase connection, vehicle identifier, refresh times, and route-calculation limits.

Change shared values there instead of copying them into feature files. The Supabase publishable key is visible in the browser by design, so Supabase Row Level Security must protect the database.

## Administration page

Administration styles are in `css/admin/`:

- `base-and-login.css` — page defaults, header, and login screen.
- `buttons-and-inputs.css` — buttons and form fields.
- `workspace-and-map.css` — navigation, sidebar, map, and GPS card.
- `stop-and-route-editors.css` — stop, attraction, and route editors.
- `bus-status-and-publishing.css` — bus status, notifications, and publishing bar.
- `export-map.css` — map export window.
- `poi-manager.css` — attraction search and import window.
- `analytics.css` — analytics dashboard.
- `tablet-and-mobile.css` — smaller-screen layout.
- `admin-interface.css` — current interface refinements.

Administration behavior is in `js/admin/`. The main feature files are:

- `start-admin-page.js` — starts the page.
- `admin-state.js` — stores current administration information.
- `connect-to-database.js` — creates the Supabase connection.
- `create-admin-map.js` and `configure-map-editor.js` — create and configure the map.
- `map-editing-actions.js` — starts stop, attraction, and route editing.
- `route-editor-actions.js` — route editor controls.
- `automatic-route-calculations.js` — automatic route calculations.
- `poi-manager-actions.js` — attraction manager actions.
- `data-and-poi-actions.js` — importing, exporting, previews, and attraction actions.
- `login-and-publishing-actions.js` — login, drafts, and publishing.
- `bus-location-actions.js` and `bus-location-service.js` — administration bus tracking.
- `connect-page-actions.js` — connects HTML `data-action` labels to JavaScript actions.

Files containing “tools,” “registry,” “services,” “readiness,” or “compatibility” support the feature files and normally do not need editing for visible changes.

## Public Live Map

Public-map styles are in `css/live-map/`:

- `page-layout.css` — page and header.
- `map-information.css` — loading, status, and information cards.
- `map-buttons.css` — floating map buttons.
- `stops-panel.css` — stop list.
- `map-markers.css` — map markers.
- `notifications.css` — small notifications.
- `leaflet-adjustments.css` — Leaflet-specific corrections.
- `mobile-layout.css` — desktop and smaller-screen rules.

Public-map behavior is in `js/live-map/`:

- `app-settings.js` — reads shared settings.
- `connect-to-database.js` — connects to Supabase.
- `create-map.js` — creates the map.
- `app-state.js` — stores routes, stops, bus, and visitor information.
- `map-buttons.js` and `map-icons.js` — controls and marker icons.
- `load-published-map.js` — downloads published map data.
- `build-route-contexts.js`, `prepare-route-data.js`, and `route-movement-calculations.js` — prepare route geometry.
- `calculate-arrivals.js` — calculates arrival times.
- `load-vehicle-progress.js` and `update-route-progress.js` — synchronize the current route and next stop.
- `stops-panel.js` and `map-popups.js` — stop list and popups.
- `track-bus.js` and `track-user.js` — bus and visitor locations.
- `display-full-route.js` — displays the complete route.
- `format-display-values.js` — formats distances and arrival times.
- `automatic-refresh.js` — synchronizes published map changes.
- `notifications.js` — loading and notification messages.
- `start-live-map.js` — starts the page and refresh timers.

JavaScript files are loaded in dependency order near the bottom of each HTML page. Keep that order unless their dependencies are intentionally changed.

## Checking the project

Run this command from PowerShell after file moves or structural changes:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\check-project.ps1
```

It checks missing references, embedded CSS or JavaScript, inline event handlers, likely encoding problems, and unbalanced CSS rules.

## Safe editing rules

1. Change one visible feature at a time.
2. Run the project checker after moves or renames.
3. Test both pages after changing shared settings or published map data.
4. Save a Git checkpoint before large changes.
