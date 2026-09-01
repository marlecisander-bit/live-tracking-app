(function() {
    const STORAGE_KEY = 'sightseeing-active-project';
    let projects = [];

    function slugify(value) {
        return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    }

    function applyProject(project) {
        if (!project) return;
        window.app.state.currentProject = project;
        window.appConfig.projectId = project._legacy ? null : project.id;
        window.appConfig.projectSlug = project.slug;
        window.appConfig.vehicleId = project.default_vehicle_id || '';
        window.appConfig.projectGpsSource = project.gps_source || null;
        localStorage.setItem(STORAGE_KEY, project.id);
        const select = document.getElementById('admin-project-select');
        if (select) select.value = project.id;
        const sourceSelect = document.getElementById('admin-gps-source');
        if (sourceSelect && project.gps_source) sourceSelect.value = project.gps_source;
        applyPermissions(project._role);
        document.dispatchEvent(new CustomEvent('projectchange', { detail: project }));
    }

    function applyPermissions(role) {
        const canEdit = ['owner', 'admin', 'editor'].indexOf(role) >= 0;
        const canAdmin = ['owner', 'admin'].indexOf(role) >= 0;
        ['draft-button', 'publish-button'].forEach(function(id) {
            const button = document.getElementById(id);
            if (button) button.disabled = !canEdit;
        });
        const createButton = document.getElementById('create-project-button');
        const accessButton = document.getElementById('invite-admin-button');
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
        const result = await client.from('projects')
            .select('id,organization_id,name,slug,default_vehicle_id,is_public,created_at')
            .order('created_at', { ascending: true });
        if (result.error) {
            console.warn('Multi-tenant tables are not deployed; using the legacy project.', result.error);
            projects = [{ id: 'legacy', organization_id: null, name: 'Sightseeing Shkodra',
                slug: window.appConfig.defaultProjectSlug, default_vehicle_id: 'sightseeing-shkodra-van-1',
                is_public: true, _role: 'owner', _legacy: true }];
            renderProjects();
            applyProject(projects[0]);
            return projects[0];
        }
        projects = result.data || [];

        if (projects.length) {
            const sourceResult = await client.from('live_map_settings')
                .select('project_slug,gps_source')
                .in('project_slug', projects.map(function(project) { return project.slug; }));
            if (!sourceResult.error) {
                const sources = {};
                (sourceResult.data || []).forEach(function(row) { sources[row.project_slug] = row.gps_source; });
                projects.forEach(function(project) { project.gps_source = sources[project.slug] || null; });
            }
        }
        if (!projects.length) {
            const workspaceName = window.prompt('Create your organization or workspace');
            if (workspaceName && workspaceName.trim()) {
                const base = slugify(workspaceName) || 'workspace';
                const uniqueSlug = base + '-' + Date.now().toString(36).slice(-5);
                const created = await window.app.supabase.getClient().rpc('create_workspace', {
                    workspace_name: workspaceName.trim(), workspace_slug: uniqueSlug,
                    first_project_name: workspaceName.trim(), first_project_slug: uniqueSlug
                });
                if (created.error) throw created.error;
                projects = created.data || [];
            }
        }
        const user = window.app.state.currentUser;
        if (user && projects.length) {
            const memberships = await window.app.supabase.getClient().from('organization_members')
                .select('organization_id,role').eq('user_id', user.id);
            if (memberships.error) throw memberships.error;
            const roles = {};
            (memberships.data || []).forEach(function(member) { roles[member.organization_id] = member.role; });
            projects.forEach(function(project) { project._role = roles[project.organization_id] || 'viewer'; });
        }
        renderProjects();
        const saved = localStorage.getItem(STORAGE_KEY);
        applyProject(projects.find(function(project) { return project.id === saved; }) || projects[0]);
        return window.app.state.currentProject || null;
    }

    async function createProject() {
        const name = window.prompt('Project name');
        if (!name || !name.trim()) return;
        const current = window.app.state.currentProject;
        if (!current) return window.app.helpers.showToast('No organization is available for this account');
        if (current._legacy) return window.app.helpers.showToast('Apply the multi-tenant database migration before creating projects');
        const slugBase = slugify(name);
        const slug = slugBase + '-' + Date.now().toString(36).slice(-5);
        const vehicleId = slug + '-van-1';
        const client = window.app.supabase.getClient();
        const user = window.app.state.currentUser;
        const inserted = await client.from('projects').insert({
            organization_id: current.organization_id,
            name: name.trim(), slug: slug, default_vehicle_id: vehicleId,
            created_by: user && user.id
        }).select('id,organization_id,name,slug,default_vehicle_id,is_public,created_at').single();
        if (inserted.error) return window.app.helpers.showToast('Project creation failed: ' + inserted.error.message);
        const vehicle = await client.from('vehicles').insert({ project_id: inserted.data.id, external_id: vehicleId, name: name.trim() + ' Van' });
        if (vehicle.error) return window.app.helpers.showToast('Project created, but vehicle creation failed: ' + vehicle.error.message);
        projects.push(inserted.data);
        inserted.data._role = current._role;
        renderProjects();
        applyProject(inserted.data);
        window.app.helpers.showToast('Project created');
    }

    async function inviteAdministrator() {
        const current = window.app.state.currentProject;
        if (!current) return;
        if (current._legacy) {
            window.alert('Team access needs the multi-tenant database migration. Apply 202608310002_multi_tenant_projects.sql in Supabase, then refresh this page.');
            return;
        }
        const email = window.prompt('Existing user email to invite');
        if (!email || !email.trim()) return;
        const requestedRole = String(window.prompt('Role: admin, editor, or viewer', 'editor') || '').toLowerCase();
        if (['admin', 'editor', 'viewer'].indexOf(requestedRole) < 0) {
            return window.app.helpers.showToast('Role must be admin, editor, or viewer');
        }
        const result = await window.app.supabase.getClient().rpc('invite_organization_member', {
            target_organization_id: current.organization_id,
            member_email: email.trim(),
            member_role: requestedRole
        });
        window.app.helpers.showToast(result.error ? 'Access update failed: ' + result.error.message : 'Access granted to ' + email.trim());
    }

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
