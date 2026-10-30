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
        const state=window.app.state,w=window.adminWorkflow,user=state.currentUser,projectId=window.appConfig.projectId;
        if(window.appConfig.ownerAcceptanceReadOnly){window.app.helpers.showToast("Read-only owner acceptance preview. Save and Publish are tested with isolated fixtures.");return null;}
        if(state.mapSaveInFlight)return null;
        if(state.mapLoadInFlight||state.loadedMapProjectId!==projectId){window.app.helpers.showToast('Wait for this project’s map to load before saving.');return null;}
        if(!user||!state.currentProject){window.app.helpers.showToast('Sign in and select a project first.');return null;}
        if(w.formDirty){window.app.helpers.showToast('Apply the open editor changes locally before saving.');return null;}
        if(w.uncertain){window.app.helpers.showToast('Save outcome uncertain. Reload to reconcile before retrying.');return null;}
        let data;
        try{data=JSON.parse(JSON.stringify(adminBuildFeatureCollection()));window.geoJsonValidation.validate(data,new TextEncoder().encode(JSON.stringify(data)).length);window.routeValidation.validate(data);}
        catch(error){window.app.helpers.showToast('Map validation: '+error.message);return null;}
        if(status==='published'&&(window.adminMapData.currentStatus!=='draft'||w.hasUnsaved())){window.app.helpers.showToast('Save a valid draft before publishing. Unsaved changes cannot be published.');return null;}
        if(status==='draft'&&!w.hasUnsaved()){window.app.helpers.showToast('No unsaved changes to save.');return null;}
        state.mapSaveInFlight=true;
        const authRevision=state.authRevision||0,revision=window.adminMapData.changeRevision,client=window.app.supabase.getClient();
        const area=document.getElementById('map-area');if(area)area.inert=true;
        window.app.helpers.setLoading(true,status==='published'?'Publishing saved draft...':'Saving draft...');
        let submitted=false;
        async function persist(){
            const access=await client.rpc('is_tracking_admin',{p:projectId});if(access.error)throw access.error;if(access.data!==true)throw new Error('Map editing permission is no longer available.');
            await w.checkHead(client,projectId);
            if(authRevision!==(state.authRevision||0)||user.id!==state.currentUser?.id||projectId!==window.appConfig.projectId)throw new Error('Session changed. Sign in and reload before saving.');
            const requestId=window.crypto.randomUUID();
            const payload={p_project:projectId,p_expected_head:w.headId,p_expected_published:w.publishedId,p_expected_draft:w.draftId,p_status:status,p_map:data,p_request:requestId};
            submitted=true;
            const result=await client.rpc('save_tracking_map',payload);
            if(result.error)throw result.error;
            if(!result.data?.id)throw new Error('Save receipt missing. Reload to reconcile.');
            if(authRevision!==(state.authRevision||0)||user.id!==state.currentUser?.id||projectId!==window.appConfig.projectId)return result.data;
            window.adminMapData.currentVersionId=result.data.id;window.adminMapData.currentStatus=status;w.saved(result.data,data);
            if(revision===window.adminMapData.changeRevision){window.adminMapData.hasChanges=false;state.unpublishedChanges=0;const count=document.getElementById('unpublished-count');if(count){count.textContent='0';count.hidden=true;}}
            window.app.helpers.showToast(status==='published'?'Saved draft published. Visitors update on their next map refresh.':'Draft saved. The public route is unchanged.');return result.data;
        }
        try{return await (window.navigator?.locks?window.navigator.locks.request('shkodra-cms-'+projectId,{ifAvailable:true},lock=>{if(!lock)throw new Error('Another browser tab is saving. Wait and reload before saving.');return persist();}):persist());}
        catch(error){if(submitted&&!/^(42501|40001|22023|235[0-9A-Z]{2})$/.test(error.code||''))w.uncertain=true;window.app.helpers.showToast((w.uncertain?'Save outcome uncertain; reload before retrying. ':'Save failed: ')+error.message);return null;}
        finally{state.mapSaveInFlight=false;if(area)area.inert=false;window.app.helpers.setLoading(false);}
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
            if (window.app.state.mapSaveInFlight || !window.confirm('Publish the last saved draft for all visitors?')) return null;
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

// Minimal owner recovery; no service credentials or custom authentication endpoint.
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const client = window.app.supabase.getClient();
        const login = document.getElementById('login-screen');
        const request = document.createElement('button');
        request.type = 'button'; request.textContent = 'Forgot password?';
        request.id = 'owner-password-recovery';
        request.addEventListener('click', async function () {
            const email = document.getElementById('login-email').value.trim();
            const errorBox = document.getElementById('login-error');
            if (!email) { errorBox.textContent = 'Enter your email address first.'; return; }
            request.disabled = true;
            try {
                const result = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
                errorBox.textContent = result.error ? 'Recovery email could not be sent. Please try again later.' : 'If this account exists, check your email for the recovery link.';
            } finally { request.disabled = false; }
        });
        request.style.cssText = 'margin-top:12px;background:transparent;color:#9b211d;box-shadow:none;padding:8px;';
        document.getElementById('login-box').appendChild(request);
        const dialog = document.createElement('dialog');
        dialog.id = 'owner-recovery-dialog';
        dialog.style.cssText = 'width:min(420px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:0;border-radius:16px;padding:24px;';
        const form = document.createElement('form');
        form.style.cssText = 'display:grid;gap:12px;';
        const title = document.createElement('h2'); title.id = 'owner-recovery-title'; title.textContent = 'Set a new password';
        dialog.setAttribute('aria-labelledby', title.id);
        const label = document.createElement('label'); label.textContent = 'New password (at least 12 characters)';
        const password = document.createElement('input'); password.type = 'password'; password.autocomplete = 'new-password'; password.required = true; password.minLength = 12; label.appendChild(password);
        const confirmationLabel = document.createElement('label'); confirmationLabel.textContent = 'Confirm new password';
        const confirmation = document.createElement('input'); confirmation.type = 'password'; confirmation.autocomplete = 'new-password'; confirmation.required = true; confirmationLabel.appendChild(confirmation);
        const status = document.createElement('p'); status.setAttribute('role', 'status');
        const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Update password';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel recovery';
        async function closeRecovery() { password.value = ''; confirmation.value = ''; await client.auth.signOut(); window.app.endAdminSession(); if (dialog.open) dialog.close(); }
        cancel.addEventListener('click', closeRecovery);
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeRecovery(); });
        form.addEventListener('submit', async function (event) {
            event.preventDefault(); if (save.disabled) return;
            if (password.value !== confirmation.value) { status.textContent = 'Passwords do not match.'; return; }
            save.disabled = true;
            try {
                const session = await client.auth.getUser();
                if (!session.data.user || session.error) { status.textContent = 'Recovery session expired. Request a new recovery email.'; return; }
                const result = await client.auth.updateUser({ password: password.value });
                if (result.error) { status.textContent = 'Password could not be updated. Check the password requirements or request a new link.'; return; }
                await closeRecovery(); document.getElementById('login-error').textContent = 'Password updated. Sign in with your new password.';
            } finally { save.disabled = false; }
        });
        for (const fieldLabel of [label, confirmationLabel]) fieldLabel.style.cssText = 'display:grid;gap:6px;';
        for (const input of [password, confirmation]) input.style.cssText = 'box-sizing:border-box;width:100%;min-height:44px;font-size:16px;';
        form.append(title, label, confirmationLabel, status, save, cancel); dialog.appendChild(form); document.body.appendChild(dialog);
        function showRecovery() { if (!dialog.open) { status.textContent = ''; dialog.showModal(); password.focus(); } }
        client.auth.onAuthStateChange(function (event) { if (event === 'PASSWORD_RECOVERY') showRecovery(); });
        // The SDK can process the callback before DOMContentLoaded listeners attach.
        if (window.appConfig.ownerRecoveryRequested) {
            window.appConfig.ownerRecoveryRequested = false;
            client.auth.getUser().then(function (result) {
                if (!result.error && result.data.user) showRecovery();
                else document.getElementById('login-error').textContent = 'Recovery link is invalid or expired. Request a new reset email.';
            });
        }
    });
})();
