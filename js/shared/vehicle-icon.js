(function() {
    const symbol =
        '<svg class="vehicle-symbol" viewBox="0 0 140 76" aria-hidden="true" focusable="false">' +
            '<path class="vehicle-body" d="M7 36 17 14Q22 5 39 4h76q12 0 17 10l5 20v24q0 5-5 5h-9l-4-11h-12q-10 0-14 11H47q-4-11-15-11T17 63H7Z"/>' +
            '<path class="vehicle-window" d="M19 16h20v20H10Z"/>' +
            '<path class="vehicle-cabin-window" d="M44 16h22v20H44ZM70 16h24v20H70ZM98 16h27q4 0 5 4l4 16H98Z"/>' +
            '<path class="vehicle-roof" d="M38 4q3-4 10-4h44q6 0 9 4Z"/>' +
            '<path class="vehicle-outline" d="M7 36 17 14Q22 5 39 4h76q12 0 17 10l5 20v24q0 5-5 5h-9l-4-11h-12q-10 0-14 11H47q-4-11-15-11T17 63H7ZM19 16h20v20H10ZM44 16h22v20H44ZM70 16h24v20H70ZM98 16h27q4 0 5 4l4 16H98ZM8 39h128M40 14v45M17 14h115"/>' +
            '<path class="vehicle-window-detail" d="M55 16v20M82 16v20M111 16v20M44 26h22M70 26h24M98 26h34"/>' +
            '<path class="vehicle-windshield-detail" d="m24 17-6 18m13-18-6 18"/>' +
            '<rect class="vehicle-detail" x="31" y="42" width="8" height="2.5" rx="1.25"/>' +
            '<rect class="vehicle-bumper" x="2" y="57" width="7" height="7" rx="2"/>' +
            '<rect class="vehicle-bumper" x="132" y="56" width="8" height="8" rx="2"/>' +
            '<circle class="vehicle-wheel" cx="32" cy="62" r="12"/>' +
            '<circle class="vehicle-wheel-rim" cx="32" cy="62" r="8"/>' +
            '<circle class="vehicle-wheel-cutout" cx="32" cy="62" r="4"/>' +
            '<circle class="vehicle-wheel" cx="107" cy="62" r="12"/>' +
            '<circle class="vehicle-wheel-rim" cx="107" cy="62" r="8"/>' +
            '<circle class="vehicle-wheel-cutout" cx="107" cy="62" r="4"/>' +
        '</svg>';

    window.vehicleIconMarkup = function() { return symbol; };
    window.renderVehicleIcons = function(root) {
        (root || document).querySelectorAll('[data-vehicle-icon]').forEach(function(element) {
            element.innerHTML = symbol;
        });
    };
    window.renderVehicleIcons();
})();
