begin read only;
set local statement_timeout='15s';
select jsonb_build_object(
 'captured_at',clock_timestamp(),
 'columns',(select jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default)) from information_schema.columns where table_schema='public'),
 'rls',(select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')),
 'policies',(select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check)) from pg_policies where schemaname='public'),
 'grants',(select jsonb_agg(jsonb_build_object('role',grantee,'schema',table_schema,'table',table_name,'privilege',privilege_type)) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')),
 'routines',(select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
 'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion)) from pg_extension),
 'cron',(select jsonb_agg(jsonb_build_object('id',jobid,'name',jobname,'schedule',schedule,'active',active,'command_md5',md5(command))) from cron.job),
 'ledger_tables',(select jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'column',column_name)) from information_schema.columns where table_schema='supabase_migrations'),
 'auth_function_privileges',(select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname in ('uid','role','jwt'))
) evidence;
commit;
