(function() {
    async function resolveProject() {
        const requestedSlug = new URLSearchParams(window.location.search).get('project') || window.appConfig.defaultProjectSlug;
        const result = await supabaseClient.from('projects')
            .select('id,name,slug,default_vehicle_id,is_public')
            .eq('slug', requestedSlug)
            .eq('is_public', true)
            .maybeSingle();
        const project = result.error
            ? { id: null, name: 'Sightseeing Shkodra', slug: window.appConfig.defaultProjectSlug,
                default_vehicle_id: 'sightseeing-shkodra-van-1', is_public: true, _legacy: true }
            : result.data;
        if (!project) throw new Error('Public project not found: ' + requestedSlug);

        if (project.id) {
            const sourceResult = await supabaseClient.from('projects')
                .select('gps_source')
                .eq('id', project.id)
                .maybeSingle();
            if (!sourceResult.error && sourceResult.data) {
                project.gps_source = sourceResult.data.gps_source;
            }
        }

        window.appConfig.projectId = project.id;
        window.appConfig.projectSlug = project.slug;
        window.appConfig.vehicleId = project.default_vehicle_id || '';
        window.appConfig.projectGpsSource = project.gps_source || null;
        window.PROJECT_ID = project.id;
        window.VEHICLE_ID = window.appConfig.vehicleId;
        document.title = project.name + ' - Live Map';
        return project;
    }
    window.publicProject = { ready: resolveProject(), current: null };
    window.publicProject.ready.then(function(project) { window.publicProject.current = project; }).catch(function(error) {
        console.error(error);
        const toast = document.getElementById('toast');
        if (toast) toast.textContent = 'This tour project is unavailable.';
    });
})();
