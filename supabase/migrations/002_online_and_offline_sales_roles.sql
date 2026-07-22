-- Upgrade the initial two-role schema to the application's three roles.
-- Existing `sales` users become `offline_sales` users.
alter type public.user_role rename value 'sales' to 'offline_sales';
alter type public.user_role add value 'online_sales';

alter table public.profiles
  alter column role set default 'offline_sales';

-- The referral amount is intentionally server-managed. Clients can read it only
-- through the RPC below and only administrators can change it.
create table public.app_settings (
  key text primary key,
  numeric_value numeric(12,2) not null check (numeric_value >= 0),
  check (key = 'online_sales_fixed_referral')
);

insert into public.app_settings (key, numeric_value)
values ('online_sales_fixed_referral', 15000)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;

create function public.get_online_sales_fixed_referral()
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare v_amount numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select numeric_value
    into v_amount
    from public.app_settings
   where key = 'online_sales_fixed_referral';

  if v_amount is null then raise exception 'Online Sales referral setting is not configured'; end if;
  return v_amount;
end;
$$;

create function public.admin_set_online_sales_fixed_referral(p_amount numeric)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Amount cannot be negative'; end if;

  update public.app_settings
     set numeric_value = p_amount
   where key = 'online_sales_fixed_referral';

  if not found then raise exception 'Online Sales referral setting is not configured'; end if;
end;
$$;

revoke all on function public.get_online_sales_fixed_referral() from public;
revoke all on function public.admin_set_online_sales_fixed_referral(numeric) from public;
grant execute on function public.get_online_sales_fixed_referral() to authenticated;
grant execute on function public.admin_set_online_sales_fixed_referral(numeric) to authenticated;

-- Assign the roles after creating users in Supabase Authentication, for example:
-- update public.profiles set role = 'offline_sales' where id = (select id from auth.users where email = 'offline.sales@truehospitals.com');
-- update public.profiles set role = 'online_sales' where id = (select id from auth.users where email = 'online.sales@truehospitals.com');
