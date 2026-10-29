-- An open series (test_series.is_open, see 20261029120000_open_mocks.sql) holds
-- plain Fedge mocks that every student can take, so it is never a coaching's
-- course: it is left out of the courses a coaching has on sale (Courses screen)
-- and of the count of them.

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
       where s.coaching_id = c.id and s.on_sale and not s.is_open), '[]'::jsonb))
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
               'series', (select count(*) from public.test_series s where s.coaching_id = c.id and s.on_sale and not s.is_open)) as row,
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
