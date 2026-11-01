-- Administrator-only user directory and role changes.
-- Accounts are still created in Supabase Authentication; this manages app access only.
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
  select p.id, p.full_name, u.email, p.role, p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

create or replace function public.admin_update_user_role(
  p_user_id uuid,
  p_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own administrator access';
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id;
  if not found then
    raise exception 'User profile not found';
  end if;
end;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_update_user_role(uuid, public.user_role) from public;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_user_role(uuid, public.user_role) to authenticated;
