-- Grants should match the policies.
--
-- Supabase gives anon and authenticated every privilege on every new table and
-- leaves row level security as the only wall. So one forgotten or too-wide
-- policy leaked a whole table. Now a privilege is kept only where a policy for
-- that command exists: a write needs BOTH a grant and a policy.
--
-- Nothing the app does today needs a privilege that is removed here: with no
-- policy for the command, RLS was already refusing it. Column-level grants
-- (coachings, series_access_codes) are left alone because those tables keep
-- their INSERT / UPDATE policies.

-- Never useful through the API.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

do $$
declare
  r record;
  v_role text;
  v_cmd text;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_cmd in array array['INSERT', 'UPDATE', 'DELETE'] loop
        if not exists (
          select 1
            from pg_policies p
           where p.schemaname = 'public'
             and p.tablename = r.relname
             and p.cmd in (v_cmd, 'ALL')
             and (v_role::name = any (p.roles) or 'public'::name = any (p.roles))
        ) then
          execute format('revoke %s on table public.%I from %I', v_cmd, r.relname, v_role);
        end if;
      end loop;
    end loop;
  end loop;
end $$;

-- A view only ever needs SELECT (coaching_payout_due is read-only reporting).
revoke insert, update, delete on public.coaching_payout_due from anon, authenticated;

-- New tables should not get the same excess by default.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
do $$
begin
  alter default privileges for role supabase_admin in schema public
    revoke truncate, trigger, references on tables from anon, authenticated;
exception when others then
  null; -- not allowed from this role: the postgres default above is the one that matters
end $$;

-- Trigger function: nobody calls it through the API.
revoke execute on function public.learn_notes_touch() from public, anon, authenticated;
