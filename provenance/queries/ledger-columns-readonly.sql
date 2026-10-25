begin read only;
set local statement_timeout='10s';
select jsonb_agg(jsonb_build_object('column',a.attname,'type',format_type(a.atttypid,a.atttypmod))) columns from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='release_metadata' and c.relname='migrations' and a.attnum>0 and not a.attisdropped;
commit;
