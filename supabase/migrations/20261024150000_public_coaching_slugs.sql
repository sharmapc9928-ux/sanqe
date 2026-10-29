-- Public coaching page links, for the sitemap.
--
-- /sitemap.xml (sanqe-app/api/sitemap.js) lists every coaching page that
-- opens without logging in, i.e. the same coachings get_coaching_page shows
-- to a logged-out visitor. Only the link and when it last changed go out;
-- nothing that isn't already on the page itself.

create or replace function public.public_coaching_slugs()
returns table (slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.slug,
         greatest(c.created_at, c.reviewed_at, (select max(s.created_at) from public.test_series s where s.coaching_id = c.id and s.on_sale))
    from public.coachings c
   where c.status = 'approved'
     and c.slug is not null
   order by c.slug
$$;

revoke all on function public.public_coaching_slugs() from public;
grant execute on function public.public_coaching_slugs() to anon, authenticated;
