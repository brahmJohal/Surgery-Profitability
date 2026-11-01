-- Fix the administrator user directory without reading Supabase's internal
-- auth.users table. Staff identity and app roles are held in public.profiles.
-- Run this after migration 009.

create or replace function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  email text,
  role public.user_role,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  return query
  select
    p.id,
    coalesce(nullif(trim(p.full_name), ''), 'Staff member') as full_name,
    null::text as email,
    p.role,
    p.created_at
  from public.profiles p
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

notify pgrst, 'reload schema';
