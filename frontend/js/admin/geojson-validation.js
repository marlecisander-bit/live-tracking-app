(function(root) {
    const MAX_BYTES = 5 * 1024 * 1024;
    function validate(data, byteLength) {
        function check(condition, message) { if (!condition) throw new Error(message); }
        check(byteLength <= MAX_BYTES, 'Map files must be at most 5 MB.');
        check(data && data.type === 'FeatureCollection' && Array.isArray(data.features), 'Expected a GeoJSON FeatureCollection.');
        check(data.features.length <= 1000, 'A map may contain at most 1,000 objects.');
        const ids = new Set(), stops = new Set(), numbers = new Set();
        let coordinateCount = 0;
        function coordinate(point) {
            check(Array.isArray(point) && point.length >= 2 && point.length <= 3 && point.every(v => typeof v === 'number' && Number.isFinite(v)), 'Coordinates must contain finite numbers.');
            check(Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90, 'Coordinates are outside latitude/longitude limits.');
            check(++coordinateCount <= 100000, 'Map geometry is too large.');
        }
        function safeKeys(value, depth) {
            check(depth <= 12, 'Map properties are nested too deeply.');
            if (!value || typeof value !== 'object') return;
            Object.keys(value).forEach(key => {
                check(!['__proto__','constructor','prototype'].includes(key), 'Unsupported property name.');
                safeKeys(value[key], depth + 1);
            });
        }
        data.features.forEach(feature => {
            check(feature && feature.type === 'Feature', 'Every object must be a Feature.');
            const p = feature.properties, g = feature.geometry;
            check(p && typeof p === 'object' && !Array.isArray(p), 'Each feature needs properties.');
            safeKeys(p, 0);
            check(typeof p.objectId === 'string' && p.objectId.length > 0 && p.objectId.length <= 150 && !ids.has(p.objectId), 'Object IDs must be present and unique.');
            ids.add(p.objectId);
            check(typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 100, 'Object names must be 1–100 characters.');
            check(p.description == null || (typeof p.description === 'string' && p.description.length <= 4000), 'Descriptions must be at most 4,000 characters.');
            check(g && ['Point','LineString'].includes(g.type), 'Only point and line geometries are supported.');
            if (g.type === 'Point') {
                coordinate(g.coordinates);
                check(['stop','poi'].includes(p.pointType), 'Points must be stops or POIs.');
                if (p.pointType === 'stop') {
                    check(Number.isInteger(Number(p.stopNumber)) && Number(p.stopNumber) > 0 && !numbers.has(Number(p.stopNumber)), 'Stop numbers must be positive and unique.');
                    stops.add(p.objectId); numbers.add(Number(p.stopNumber));
                }
            } else {
                check(Array.isArray(g.coordinates) && g.coordinates.length >= 2, 'Routes need at least two coordinates.');
                g.coordinates.forEach(coordinate);
            }
            if (p.sticker) check(typeof p.sticker === 'string' && p.sticker.length <= 200 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.sticker), 'Stickers must be bounded PNG data URLs.');
        });
        data.features.forEach(feature => {
            const sequence = feature.properties.stopSequence;
            if (sequence != null) check(Array.isArray(sequence) && sequence.length <= 1000 && sequence.every(id => stops.has(id)), 'Route stop references must identify stops in this map.');
        });
        return data;
    }
    const api = { validate, MAX_BYTES };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.geoJsonValidation = api;
})(typeof window !== 'undefined' ? window : globalThis);
