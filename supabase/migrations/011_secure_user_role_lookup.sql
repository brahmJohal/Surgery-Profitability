-- Server-only role lookup for the Administrator Edge Function.
-- The browser cannot call this function.

create or replace function public.server_user_role(p_user_id uuid)
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = p_user_id;
$$;

revoke all on function public.server_user_role(uuid) from public;
grant execute on function public.server_user_role(uuid) to service_role;

create or replace function public.server_update_user_role(
  p_user_id uuid,
  p_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set role = p_role where id = p_user_id;
  if not found then raise exception 'User profile not found'; end if;
end;
$$;

create or replace function public.server_save_user_profile(
  p_user_id uuid,
  p_full_name text,
  p_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (p_user_id, p_full_name, p_role)
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
end;
$$;

revoke all on function public.server_update_user_role(uuid, public.user_role) from public;
revoke all on function public.server_save_user_profile(uuid, text, public.user_role) from public;
grant execute on function public.server_update_user_role(uuid, public.user_role) to service_role;
grant execute on function public.server_save_user_profile(uuid, text, public.user_role) to service_role;

notify pgrst, 'reload schema';
