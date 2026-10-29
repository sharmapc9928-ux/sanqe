-- Coaching state.
--
-- The coaching sign-up form now asks for the state first, then the city
-- from that state's list (or a typed one). The page, the student's list of
-- coachings and the admin list show "City, State".

alter table public.coachings add column if not exists state text;
alter table public.coachings drop constraint if exists coachings_state_length;
alter table public.coachings add constraint coachings_state_length
  check (state is null or length(state) <= 60);

grant insert (state) on public.coachings to authenticated;
grant update (state) on public.coachings to authenticated;

create or replace function public.get_coaching_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'city', c.city, 'state', c.state, 'about', c.about, 'slug', c.slug, 'status', c.status,
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'exam', s.exam, 'description', s.description, 'price_inr', s.price_inr,
               'mocks', (select count(*) from public.coaching_mocks m where m.series_id = s.id and m.status = 'published'),
               'enrolled', exists (select 1 from public.series_enrollments e where e.series_id = s.id and e.user_id = (select auth.uid())))
             order by s.created_at desc)
        from public.test_series s
       where s.coaching_id = c.id and s.on_sale), '[]'::jsonb))
    from public.coachings c
   where c.slug = lower(btrim(p_slug))
     and (c.status = 'approved' or c.owner_id = (select auth.uid()))
$$;

create or replace function public.my_coachings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.row order by t.joined_at desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', c.id, 'name', c.name, 'city', c.city, 'state', c.state, 'slug', c.slug,
               'series', (select count(*) from public.test_series s where s.coaching_id = c.id and s.on_sale)) as row,
             min(j.joined_at) as joined_at
        from public.coachings c
        join (
          select cs.coaching_id, cs.joined_at from public.coaching_students cs where cs.user_id = (select auth.uid())
          union all
          select s.coaching_id, e.enrolled_at from public.series_enrollments e
            join public.test_series s on s.id = e.series_id
           where e.user_id = (select auth.uid())
        ) j on j.coaching_id = c.id
       where c.status = 'approved'
       group by c.id
    ) t
$$;

drop function if exists public.admin_coachings();
create function public.admin_coachings()
returns table (id uuid, name text, city text, state text, phone text, about text, status text, created_at timestamptz,
               reviewed_at timestamptz, owner_email text, series bigint, students bigint, slug text, commission_pct numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.city, c.state, c.phone, c.about, c.status, c.created_at, c.reviewed_at, u.email::text,
           (select count(*) from public.test_series s where s.coaching_id = c.id),
           (select count(distinct e.user_id) from public.series_enrollments e join public.test_series s on s.id = e.series_id where s.coaching_id = c.id),
           c.slug, c.commission_pct
      from public.coachings c
      join auth.users u on u.id = c.owner_id
     order by (c.status = 'pending') desc, c.created_at desc;
end;
$$;

revoke all on function public.admin_coachings() from public, anon;
grant execute on function public.admin_coachings() to authenticated;
