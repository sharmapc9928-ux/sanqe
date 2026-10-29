-- Security advisor 0014: extensions should not live in the public schema.
-- pg_net is not relocatable, so it has to be recreated. Nothing in this
-- project uses it (no triggers, functions or cron jobs reference net.*), so
-- recreating it is safe.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
