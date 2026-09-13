(function(root) {
    'use strict';
    const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const date = value => { const ms = value ? Date.parse(value) : NaN; return Number.isFinite(ms) ? ms : null; };
    const eventTime = row => date(row.event_at);
    const positionTime = row => date(row.source_recorded_at || row.received_at);
    const stopKey = row => String(row.stop_number || row.stop_id || row.stop_name || '');
    const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    function duration(seconds) {
        if (seconds == null) return '—';
        const minutes = Math.round(seconds / 60);
        return minutes >= 60 ? Math.floor(minutes / 60) + ' h ' + minutes % 60 + ' min' : minutes + ' min';
    }
    function summarize(positions, events, mapVersion) {
        const sorted = events.filter(e => eventTime(e) != null).slice().sort((a,b) => eventTime(a) - eventTime(b));
        const visits = [], pending = new Map(), journeys = [], groups = new Map();
        let departure = null;
        sorted.forEach(event => {
            const key = stopKey(event), time = eventTime(event);
            if (event.event_type === 'arrival') {
                // A later visit to another stop means any unmatched arrival is incomplete.
                for (const pendingKey of pending.keys()) if (pendingKey !== key) pending.delete(pendingKey);
                if (!pending.has(key)) {
                    const visit = { name: event.stop_name || key, arrival: time, departure: null, seconds: null };
                    pending.set(key, visit); visits.push(visit);
                }
                if (departure && stopKey(departure) !== key && time > eventTime(departure)) {
                    journeys.push({ key: stopKey(departure) + '|' + key, name: (departure.stop_name || stopKey(departure)) + ' → ' + (event.stop_name || key), seconds: (time - eventTime(departure)) / 1000 });
                }
                departure = null;
            } else if (event.event_type === 'departure') {
                const visit = pending.get(key) || { name: event.stop_name || key, arrival: null };
                if (!pending.has(key)) visits.push(visit);
                visit.departure = time;
                const measured = number(event.dwell_seconds);
                visit.seconds = measured != null && measured >= 0 ? measured : visit.arrival != null && time >= visit.arrival ? (time - visit.arrival) / 1000 : null;
                pending.delete(key); departure = event;
            }
        });
        journeys.forEach(journey => {
            if (!groups.has(journey.key)) groups.set(journey.key, { name: journey.name, values: [] });
            groups.get(journey.key).values.push(journey.seconds);
        });
        const features = mapVersion && mapVersion.map_data && mapVersion.map_data.features || [];
        const sequence = [...new Set(features.filter(f => f.geometry && f.geometry.type === 'Point' && f.properties && f.properties.pointType === 'stop' && f.properties.active !== false)
            .map(f => String(f.properties.stopNumber || '')).filter(Boolean))].sort((a,b) => Number(a) - Number(b));
        const tourDurations = [];
        let start = null, next = 1;
        sorted.forEach(event => {
            // Only infer tours against the map that was in effect at the time.
            if (sequence.length < 2 || sequence[0] !== '1' || eventTime(event) < (date(mapVersion.published_at) || Infinity)) return;
            const key = String(event.stop_number || event.stop_id || '');
            if (key === sequence[0] && event.event_type === 'departure') {
                if (start == null) { start = eventTime(event); next = 1; }
            } else if (start != null && event.event_type === 'arrival') {
                if (key === sequence[0]) {
                    if (next === sequence.length) tourDurations.push((eventTime(event) - start) / 1000);
                    start = null;
                } else if (key === sequence[next]) next += 1;
            }
        });
        let distance = 0, driving = 0, stationary = 0, intervals = 0, gaps = 0;
        const gps = positions.filter(p => positionTime(p) != null).slice().sort((a,b) => positionTime(a) - positionTime(b));
        for (let i = 1; i < gps.length; i++) {
            const a = gps[i-1], b = gps[i], seconds = (positionTime(b) - positionTime(a)) / 1000;
            const coords = [a.latitude, a.longitude, b.latitude, b.longitude].map(number);
            if (seconds <= 0) continue;
            if (seconds > 900 || coords.some(v => v == null) || Math.abs(coords[0]) > 90 || Math.abs(coords[2]) > 90 || Math.abs(coords[1]) > 180 || Math.abs(coords[3]) > 180) { gaps++; continue; }
            const [lat1, lng1, lat2, lng2] = coords.map(v => v * Math.PI / 180);
            const h = Math.sin((lat2-lat1)/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin((lng2-lng1)/2)**2;
            const km = 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
            if (km / seconds * 3600 > 120) { gaps++; continue; }
            distance += km; intervals++;
            const speed = number(a.speed_kmh);
            if (speed != null && speed >= 0 && speed <= 120) {
                if (speed > 2) driving += seconds; else stationary += seconds;
            }
        }
        return { visits: visits.reverse(), routes: [...groups.values()].map(g => ({ name: g.name, count: g.values.length, seconds: mean(g.values) })),
            tourCount: sequence.length >= 2 && sequence[0] === '1' && date(mapVersion.published_at) != null ? tourDurations.length : null, tourSeconds: mean(tourDurations),
            distance: intervals ? distance : null, driving: driving || stationary ? driving : null, stationary: driving || stationary ? stationary : null, gaps,
            dwell: mean(visits.map(v => v.seconds).filter(v => v != null)), records: gps.length };
    }
    const api = { number, date, positionTime, mean, duration, summarize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.analyticsModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
