(function() {
    const STORAGE_KEY = 'sightseeing-active-project';
    let projects = [];
    let projectLoadRequest = 0;

    function applyProject(project) {
        if (!project) return;
        const previousProject = window.app.state.currentProject;
        if (previousProject && previousProject.id !== project.id) {
            if (window.app.state.mapSaveInFlight || (window.adminMapData?.hasChanges && !window.confirm('Discard unsaved map changes and switch project?'))) {
                document.getElementById('admin-project-select').value = previousProject.id;
                return false;
            }
        }
        window.app.state.currentProject = project;
        window.appConfig.projectId = project._legacy ? null : project.id;
        window.appConfig.projectSlug = project.slug;
        window.appConfig.vehicleId = project.default_vehicle_id || '';
        window.appConfig.projectGpsSource = project.gps_source || null;
        localStorage.setItem(STORAGE_KEY, project.id);
        const select = document.getElementById('admin-project-select');
        if (select) select.value = project.id;
        const sourceSelect = document.getElementById('admin-gps-source');
        if (sourceSelect) sourceSelect.value = project.gps_source || (window.appConfig.providerSelectionEnabled ? '' : window.appConfig.defaultGpsSource);
        applyPermissions(project._role);
        document.dispatchEvent(new CustomEvent('projectchange', { detail: project }));
    }

    function applyPermissions(role) {
        const canEdit = ['owner', 'admin', 'editor'].indexOf(role) >= 0;
        const canAdmin = false; // Single-project administration has no team/provider controls.
        ['draft-button', 'publish-button'].forEach(function(id) {
            const button = document.getElementById(id);
            if (button) button.disabled = !canEdit;
        });
        const createButton = document.getElementById('create-project-button');
        const accessButton = document.getElementById('invite-admin-button');
        const gpsSourceSelect = document.getElementById('admin-gps-source');
        if (gpsSourceSelect) gpsSourceSelect.disabled = !canAdmin;
        if (createButton) createButton.hidden = !canAdmin;
        if (accessButton) accessButton.hidden = !canAdmin;
    }

    function renderProjects() {
        const select = document.getElementById('admin-project-select');
        if (!select) return;
        select.replaceChildren();
        projects.forEach(function(project) {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            select.appendChild(option);
        });
    }

    async function loadProjects() {
        const client = window.app.supabase.getClient();
        const signedInUser = window.app.state.currentUser;
        const request = ++projectLoadRequest;
        const authRevision = window.app.state.authRevision || 0;
        function ensureCurrent() {
            if (request !== projectLoadRequest || signedInUser?.id !== window.app.state.currentUser?.id || authRevision !== (window.app.state.authRevision || 0)) throw new Error('Session changed while loading projects.');
        }
        if (!signedInUser) throw new Error('Sign in to choose a project.');
        {
            const result = await client.from('projects').select('id,name,slug,default_vehicle_id,is_public').order('name');
            ensureCurrent();
            if (result.error) throw result.error;
            const permitted = [];
            for (const project of result.data || []) {
                const access = await client.rpc('is_tracking_admin', { p: project.id });
                ensureCurrent();
                if (access.error) throw access.error;
                if (access.data === true) permitted.push(Object.assign(project, { _role: 'owner', gps_source: 'scorpion' }));
            }
            projects = permitted;
            renderProjects();
            if (!projects.length) {
                window.app.state.currentProject = null;
                applyPermissions('viewer');
                throw new Error('This account has no map editing access. Ask the map owner to grant access.');
            }
            const saved = localStorage.getItem(STORAGE_KEY);
            applyProject(projects.find(project => project.id === saved) || projects[0]);
            return window.app.state.currentProject;
        }
    }

    async function createProject() { return window.app.helpers.showToast('Project setup is managed securely in Supabase.'); }
    async function inviteAdministrator() { return window.app.helpers.showToast('Access is managed securely by the map owner.'); }

    window.app.projects = { load: loadProjects, create: createProject, current: function() { return window.app.state.currentProject; } };
    window.app.registerActionGroup('projectActions', { createProject: createProject, inviteAdministrator: inviteAdministrator });

    document.addEventListener('DOMContentLoaded', function() {
        const select = document.getElementById('admin-project-select');
        if (select) select.addEventListener('change', function() {
            const selected = projects.find(function(project) { return project.id === select.value; });
            applyProject(selected);
        });
    });
})();
