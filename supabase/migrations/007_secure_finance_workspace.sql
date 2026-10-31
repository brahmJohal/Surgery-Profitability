-- Protected server persistence for Finance MOU rules, payee details and payouts.
-- Run after migrations 001–006.

-- Kept here too so a partial/older security migration cannot block Finance.
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_table text not null,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;

-- Defined here as well so Finance can be secured on projects that did not run
-- the earlier optional reconciliation migration.
create or replace function public.is_finance_or_admin ()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('admin', 'finance')
  );
$$;

revoke all on function public.is_finance_or_admin() from public;

create table if not exists public.finance_mou_rules (
  id text primary key,
  payload jsonb not null,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.finance_payee_profiles (
  id text primary key,
  payload jsonb not null,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.finance_workspace_payables (
  id text primary key,
  payload jsonb not null,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

alter table public.finance_mou_rules enable row level security;
alter table public.finance_payee_profiles enable row level security;
alter table public.finance_workspace_payables enable row level security;

revoke all on table public.finance_mou_rules,
  public.finance_payee_profiles,
  public.finance_workspace_payables
from anon, authenticated;

create or replace function public.finance_load_workspace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_finance_or_admin() then
    raise exception 'Finance access required';
  end if;

  return jsonb_build_object(
    'rules', coalesce((select jsonb_agg(payload order by updated_at) from public.finance_mou_rules), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(payload order by updated_at) from public.finance_payee_profiles), '[]'::jsonb),
    'payables', coalesce((select jsonb_agg(payload order by updated_at desc) from public.finance_workspace_payables), '[]'::jsonb)
  );
end;
$$;

create or replace function public.finance_replace_rules(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_finance_or_admin() then raise exception 'Finance access required'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Rules must be an array'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) item where nullif(trim(item ->> 'id'), '') is null) then
    raise exception 'Every rule must have an ID';
  end if;
  delete from public.finance_mou_rules where true;
  insert into public.finance_mou_rules (id, payload, updated_by)
  select id, payload, auth.uid()
  from (
    select distinct on (item ->> 'id') item ->> 'id' as id, item as payload, ordinal
    from jsonb_array_elements(p_items) with ordinality as entries(item, ordinal)
    order by item ->> 'id', ordinal desc
  ) deduplicated;
  insert into public.admin_audit_log (actor_id, action, target_table, after_data)
  values (auth.uid(), 'replace_finance_rules', 'public.finance_mou_rules', jsonb_build_object('count', jsonb_array_length(p_items)));
end;
$$;

create or replace function public.finance_replace_profiles(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_finance_or_admin() then raise exception 'Finance access required'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Profiles must be an array'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) item where nullif(trim(item ->> 'name'), '') is null) then
    raise exception 'Every profile must have a name';
  end if;
  delete from public.finance_payee_profiles where true;
  insert into public.finance_payee_profiles (id, payload, updated_by)
  select id, payload, auth.uid()
  from (
    select distinct on (lower(trim(item ->> 'name')))
      lower(trim(item ->> 'name')) as id, item as payload, ordinal
    from jsonb_array_elements(p_items) with ordinality as entries(item, ordinal)
    order by lower(trim(item ->> 'name')), ordinal desc
  ) deduplicated;
  insert into public.admin_audit_log (actor_id, action, target_table, after_data)
  values (auth.uid(), 'replace_finance_profiles', 'public.finance_payee_profiles', jsonb_build_object('count', jsonb_array_length(p_items)));
end;
$$;

create or replace function public.finance_replace_payables(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_finance_or_admin() then raise exception 'Finance access required'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Payables must be an array'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) item where nullif(trim(item ->> 'id'), '') is null) then
    raise exception 'Every payable must have an ID';
  end if;
  delete from public.finance_workspace_payables where true;
  insert into public.finance_workspace_payables (id, payload, updated_by)
  select id, payload, auth.uid()
  from (
    select distinct on (item ->> 'id') item ->> 'id' as id, item as payload, ordinal
    from jsonb_array_elements(p_items) with ordinality as entries(item, ordinal)
    order by item ->> 'id', ordinal desc
  ) deduplicated;
  insert into public.admin_audit_log (actor_id, action, target_table, after_data)
  values (auth.uid(), 'replace_finance_payables', 'public.finance_workspace_payables', jsonb_build_object('count', jsonb_array_length(p_items)));
end;
$$;

revoke all on function public.finance_load_workspace() from public;
revoke all on function public.finance_replace_rules(jsonb) from public;
revoke all on function public.finance_replace_profiles(jsonb) from public;
revoke all on function public.finance_replace_payables(jsonb) from public;

grant execute on function public.finance_load_workspace() to authenticated;
grant execute on function public.finance_replace_rules(jsonb) to authenticated;
grant execute on function public.finance_replace_profiles(jsonb) to authenticated;
grant execute on function public.finance_replace_payables(jsonb) to authenticated;
