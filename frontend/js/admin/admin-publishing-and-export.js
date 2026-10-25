(function() {
    window.app.endAdminSession = function() {
        window.app.state.authRevision = (window.app.state.authRevision || 0) + 1;
        window.app.state.currentUser = null;
        window.app.state.currentProject = null;
        window.app.state.loadedMapProjectId = undefined;
        document.getElementById('login-screen').style.display = 'flex';
        document.dispatchEvent(new CustomEvent('adminsessionended'));
    };
    const exportLoads = new Map();
    function loadExportLibrary(url) {
        if (!exportLoads.has(url)) exportLoads.set(url, new Promise(function(resolve, reject) {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = function() { script.remove(); exportLoads.delete(url); reject(new Error('Export library unavailable')); };
            document.head.appendChild(script);
        }));
        return exportLoads.get(url);
    }
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
        if (window.app.state.mapSaveInFlight) return null;
        if (window.app.state.mapLoadInFlight || window.app.state.loadedMapProjectId !== window.appConfig.projectId) { window.app.helpers.showToast('Wait for this project?s map to load before saving.'); return null; }
        const user = window.app.state.currentUser;
        const projectId = window.appConfig.projectId;
        if (!user || !window.app.state.currentProject) { window.app.helpers.showToast('Sign in and select a project first.'); return null; }
        window.app.state.mapSaveInFlight = true;
        const revision = window.adminMapData.changeRevision;
        const authRevision = window.app.state.authRevision || 0;
        window.app.helpers.setLoading(true, status === 'published' ? 'Publishing map...' : 'Saving draft...');
        try {
            const payload = { status, created_by: user.id, map_data: JSON.parse(JSON.stringify(adminBuildFeatureCollection())) };
            if (projectId) payload.project_id = projectId;
            if (status === 'published') payload.published_at = new Date().toISOString();
            const result = await window.app.supabase.getClient().from('map_versions').insert(payload).select('id,status,published_at,created_at').single();
            if (result.error) throw result.error;
            if (authRevision !== (window.app.state.authRevision || 0) || projectId !== window.appConfig.projectId || user.id !== window.app.state.currentUser?.id) return result.data;
            window.adminMapData.currentVersionId = result.data.id;
            window.adminMapData.currentStatus = result.data.status;
            if (revision === window.adminMapData.changeRevision) {
                window.adminMapData.hasChanges = false;
                window.app.state.unpublishedChanges = 0;
                const count = document.getElementById('unpublished-count');
                if (count) { count.textContent = '0'; count.hidden = true; }
            }
            if (status === 'published') {
                const published = document.getElementById('last-published');
                if (published) published.textContent = new Date(result.data.published_at || result.data.created_at).toLocaleString();
            }
            window.app.helpers.showToast(status === 'published' ? 'Map published successfully' : 'Draft saved successfully');
            return result.data;
        } catch (error) {
            window.app.helpers.showToast('Save failed: ' + error.message);
            return null;
        } finally {
            window.app.state.mapSaveInFlight = false;
            window.app.helpers.setLoading(false);
        }
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
                content += '<polyline points="' + points + '" fill="none" stroke="' + window.mapContentSafety.escape(p.color || '#d90000') + '" stroke-width="' + window.mapContentSafety.escape(p.weight || 6) + '" stroke-linecap="round" stroke-linejoin="round"/>';
            }
            if (geometry.type === 'Point') {
                const point = project(geometry.coordinates);
                content += '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="12" fill="white" stroke="#d90000" stroke-width="4"/>';
                content += '<text x="' + point[0] + '" y="' + (point[1] + 4) + '" text-anchor="middle" font-family="Arial" font-size="11">' + window.mapContentSafety.escape(p.stopNumber || '•') + '</text>';
            }
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' + content + '</svg>';
    }

    const actions = {
        adminLogin: async function() {
            if (window.app.state.loginInFlight) return;
            window.app.state.loginInFlight = true;
            const authRevision = (window.app.state.authRevision || 0) + 1;
            window.app.state.authRevision = authRevision;
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const errorBox = document.getElementById('login-error');
            if (errorBox) errorBox.textContent = '';
            try {
                const result = await window.app.supabase.getClient().auth.signInWithPassword({ email: email, password: password });
                if (result.error) throw result.error;
                if (authRevision !== (window.app.state.authRevision || 0)) return;
                if (window.app && window.app.state) window.app.state.currentUser = result.data.user;
                document.getElementById('login-screen').style.display = 'none';
                await window.app.projects.load();
                await window.app.projectLoadPromise;
                window.app.helpers.showToast('Logged in successfully');
            } catch (error) {
                document.getElementById('login-screen').style.display = 'flex';
                if (errorBox) errorBox.textContent = error.message || 'Login failed';
            } finally { window.app.state.loginInFlight = false; }
        },
        saveDraft: function() { return saveVersion('draft'); },
        publishMap: async function() {
            if (window.app.state.mapSaveInFlight || !window.confirm('Publish this map for all visitors?')) return null;
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
            if (file.size > window.geoJsonValidation.MAX_BYTES) {
                window.app.helpers.showToast('Map files must be at most 5 MB.');
                event.target.value = '';
                return;
            }
            if (window.app.state.mapLoadInFlight || !window.app.state.currentUser) { window.app.helpers.showToast('Sign in and wait for your map to load before importing.'); event.target.value = ''; return; }
            const projectAtImport = window.appConfig.projectId;
            const revisionAtImport = window.adminMapData.changeRevision;
            const authAtImport = window.app.state.authRevision || 0;
            const reader = new FileReader();
            reader.onload = function() {
                try {
                    const data = JSON.parse(reader.result);
                    if (projectAtImport !== window.appConfig.projectId || authAtImport !== (window.app.state.authRevision || 0) || revisionAtImport !== window.adminMapData.changeRevision || window.app.state.mapLoadInFlight) throw new Error('The map or session changed while reading the file. Please import again.');
                    window.geoJsonValidation.validate(data, file.size);
                    adminRenderMapData(data);
                    adminMarkChanged();
                    window.app.helpers.showToast('GeoJSON imported');
                } catch (error) {
                    window.app.helpers.showToast(error.message || 'Invalid GeoJSON file');
                }
                event.target.value = '';
            };
            reader.onerror = function() { window.app.helpers.showToast('The map file could not be read.'); event.target.value = ''; };
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
                    await loadExportLibrary('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
                    if (format === 'pdf') await loadExportLibrary('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
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
        const client = window.app.supabase.getClient();
        client.auth.onAuthStateChange(function(event, session) {
            if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) window.app.endAdminSession();
        });
        const authRevision = window.app.state.authRevision || 0;
        try {
            const result = await window.app.supabase.getClient().auth.getSession();
            if (authRevision !== (window.app.state.authRevision || 0) || window.app.state.loginInFlight) return;
            if (result.data && result.data.session) {
                if (window.app && window.app.state) window.app.state.currentUser = result.data.session.user;
                document.getElementById('login-screen').style.display = 'none';
                await window.app.projects.load();
                await window.app.projectLoadPromise;
            }
        } catch (error) {
            console.warn('Could not restore admin session.', error);
        }
    });
})();
