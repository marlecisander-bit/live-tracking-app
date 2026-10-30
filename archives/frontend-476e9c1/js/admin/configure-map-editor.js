window.app = window.app || {};

window.app.mapSetup = function(map) {
    if (!map || typeof map.pm === 'undefined') {
        return;
    }

    map.pm.addControls({
        position: 'topleft',
        drawMarker: false,
        drawPolyline: false,
        drawPolygon: false,
        drawRectangle: false,
        drawCircle: false,
        drawCircleMarker: false,
        drawText: false,
        editMode: true,
        dragMode: true,
        cutPolygon: false,
        removalMode: false
    });

    map.pm.setGlobalOptions({
        snappable: true,
        snapDistance: 12,
        snapMiddle: false
    });
};
