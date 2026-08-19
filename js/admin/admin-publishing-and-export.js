(function() {
    function downloadBlob(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);
    }

    async function saveVersion(status) {
        const client = window.app.supabase.getClient();
        const payload = {
            status: status,
            map_data: adminBuildFeatureCollection()
        };
        if (window.app && window.app.state && window.app.state.currentUser) {
            payload.created_by = window.app.state.currentUser.id;
        }
        if (status === 'published') payload.published_at = new Date().toISOString();

        window.app.helpers.setLoading(true, status === 'published' ? 'Publishing map...' : 'Saving draft...');
        const result = await client.from('map_versions').insert(payload).select('id,status,published_at,created_at').single();
        window.app.helpers.setLoading(false);

        if (result.error) {
            console.error(result.error);
            window.app.helpers.showToast('Save failed: ' + result.error.message);
            return null;
        }

        window.adminMapData.currentVersionId = result.data.id;
        window.adminMapData.currentStatus = result.data.status;
        window.adminMapData.hasChanges = false;
        if (window.app && window.app.state) window.app.state.unpublishedChanges = 0;
        const count = document.getElementById('unpublished-count');
        if (count) count.textContent = '0';
        if (status === 'published') {
            const published = document.getElementById('last-published');
            if (published) published.textContent = new Date(result.data.published_at || result.data.created_at).toLocaleString();
        }
        window.app.helpers.showToast(status === 'published' ? 'Map published successfully' : 'Draft saved successfully');
        return result.data;
    }

    function geoJsonToSvg(data) {
        const width = 1200, height = 800, padding = 50;
        const coordinates = [];
        data.features.forEach(function(feature) {
            const geometry = feature.geometry || {};
            if (geometry.type === 'Point') coordinates.push(geometry.coordinates);
            if (geometry.type === 'LineString') geometry.coordinates.forEach(function(point) { coordinates.push(point); });
        });
        if (!coordinates.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"></svg>';
        const xs = coordinates.map(function(p) { return p[0]; });
        const ys = coordinates.map(function(p) { return p[1]; });
        const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
        const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
        const project = function(p) {
            const x = padding + ((p[0] - minX) / (maxX - minX || 1)) * (width - padding * 2);
            const y = height - padding - ((p[1] - minY) / (maxY - minY || 1)) * (height - padding * 2);
            return [x, y];
        };
        let content = '<rect width="100%" height="100%" fill="white"/>';
        data.features.forEach(function(feature) {
            const p = feature.properties || {}, geometry = feature.geometry || {};
            if (geometry.type === 'LineString') {
                const points = geometry.coordinates.map(project).map(function(point) { return point.join(','); }).join(' ');
                content += '<polyline points="' + points + '" fill="none" stroke="' + (p.color || '#d90000') + '" stroke-width="' + (p.weight || 6) + '" stroke-linecap="round" stroke-linejoin="round"/>';
            }
            if (geometry.type === 'Point') {
                const point = project(geometry.coordinates);
                content += '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="12" fill="white" stroke="#d90000" stroke-width="4"/>';
                content += '<text x="' + point[0] + '" y="' + (point[1] + 4) + '" text-anchor="middle" font-family="Arial" font-size="11">' + (p.stopNumber || '•') + '</text>';
            }
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' + content + '</svg>';
    }

    const actions = {
        adminLogin: async function() {
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const errorBox = document.getElementById('login-error');
            if (errorBox) errorBox.textContent = '';
            try {
                const result = await window.app.supabase.getClient().auth.signInWithPassword({ email: email, password: password });
                if (result.error) throw result.error;
                if (window.app && window.app.state) window.app.state.currentUser = result.data.user;
                document.getElementById('login-screen').style.display = 'none';
                await adminLoadLatestMap();
                window.app.helpers.showToast('Logged in successfully');
            } catch (error) {
                if (errorBox) errorBox.textContent = error.message || 'Login failed';
            }
        },
        saveDraft: function() { return saveVersion('draft'); },
        publishMap: async function() {
            if (!window.confirm('Publish this map for all visitors?')) return null;
            return saveVersion('published');
        },
        exportGeoJSON: function() {
            const json = JSON.stringify(adminBuildFeatureCollection(), null, 2);
            downloadBlob(new Blob([json], { type: 'application/geo+json' }), 'sightseeing-shkodra-map.geojson');
        },
        triggerGeoJsonImport: function() { document.getElementById('import-file').click(); },
        importGeoJSON: function(event) {
            const file = event && event.target && event.target.files ? event.target.files[0] : null;
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function() {
                try {
                    const data = JSON.parse(reader.result);
                    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Not a FeatureCollection');
                    adminRenderMapData(data);
                    adminMarkChanged();
                    window.app.helpers.showToast('GeoJSON imported');
                } catch (error) {
                    window.app.helpers.showToast('Invalid GeoJSON file');
                }
                event.target.value = '';
            };
            reader.readAsText(file);
        },
        exportMapNow: async function() {
            const status = document.getElementById('export-map-status');
            const format = document.getElementById('export-map-format').value;
            const title = document.getElementById('export-map-title').value.trim() || 'Sightseeing Shkodra';
            if (status) status.textContent = 'Preparing export...';
            try {
                if (format === 'svg') {
                    downloadBlob(new Blob([geoJsonToSvg(adminBuildFeatureCollection())], { type: 'image/svg+xml' }), title + '.svg');
                } else {
                    const scale = Number(document.getElementById('export-map-scale').value) || 2;
                    const canvas = await html2canvas(document.getElementById('map-area'), { useCORS: true, scale: scale, backgroundColor: '#ffffff' });
                    if (format === 'pdf') {
                        const jsPDF = window.jspdf && window.jspdf.jsPDF;
                        const pdf = new jsPDF({ orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
                        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
                        pdf.save(title + '.pdf');
                    } else {
                        canvas.toBlob(function(blob) { downloadBlob(blob, title + '.png'); }, 'image/png');
                    }
                }
                if (status) status.textContent = 'Export complete.';
            } catch (error) {
                console.error(error);
                if (status) status.textContent = 'Export failed. The map tiles may block image export.';
            }
        }
    };

    window.app.registerActionGroup('adminPublishing', actions);

    document.addEventListener('DOMContentLoaded', async function() {
        try {
            const result = await window.app.supabase.getClient().auth.getSession();
            if (result.data && result.data.session) {
                if (window.app && window.app.state) window.app.state.currentUser = result.data.session.user;
                document.getElementById('login-screen').style.display = 'none';
            }
        } catch (error) {
            console.warn('Could not restore admin session.', error);
        }
    });
})();
