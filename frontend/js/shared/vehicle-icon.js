(function() {
    // Keep the existing side-view artwork on live public/admin vehicle markers.
    const symbol = '<img class="vehicle-symbol" src="assets/brand/sightseeing-van.svg" alt="" aria-hidden="true" draggable="false">';

    const controlSymbol = '<img class="vehicle-symbol vehicle-control-symbol" src="assets/brand/bus-front.svg" alt="" aria-hidden="true" draggable="false">';

    window.vehicleIconMarkup = function() { return symbol; };
    // The artwork faces west. Mirror only the image, never Leaflet's positioning.
    const facing = new WeakMap();
    window.updateVehicleFacing = function(marker, position, speed, source) {
        let state = facing.get(marker);
        if (!state || state.source !== source) {
            state = { lat: position.lat, lng: position.lng, source: source, right: false };
            facing.set(marker, state);
        }
        const east = (position.lng - state.lng) * 111320 * Math.cos(position.lat * Math.PI / 180);
        const north = (position.lat - state.lat) * 111320;
        const distance = Math.hypot(east, north);
        // Ignore parked jitter, almost vertical travel and implausible jumps.
        if (distance > 1000 || (speed != null && Number(speed) < 2)) {
            state.lat = position.lat; state.lng = position.lng;
        } else if (distance >= 12) {
            if (Math.abs(east) >= 8 && Math.abs(east) / distance >= 0.25) state.right = east > 0;
            state.lat = position.lat; state.lng = position.lng;
        }
        const element = marker.getElement();
        const icon = element && element.querySelector('.vehicle-symbol');
        if (icon) icon.style.transform = state.right ? 'scaleX(-1)' : 'scaleX(1)';
    };
    window.renderVehicleIcons = function(root) {
        (root || document).querySelectorAll('[data-vehicle-icon]').forEach(function(element) {
            element.innerHTML = controlSymbol;
        });
    };
    window.renderVehicleIcons();
})();
