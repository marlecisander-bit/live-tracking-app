begin read only;
set local statement_timeout='10s';
select jsonb_build_object('captured_at',clock_timestamp(),'ledger_relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'relation',c.relname,'kind',c.relkind,'readable',has_table_privilege(current_user,c.oid,'SELECT'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and c.relkind in ('r','v') and (n.nspname='supabase_migrations' or c.relname ilike '%migration%'))) evidence;
commit;
