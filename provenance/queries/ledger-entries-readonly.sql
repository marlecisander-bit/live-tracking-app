begin read only;
set local statement_timeout='10s';
select file,sha256,applied_at from release_metadata.migrations order by file;
commit;
