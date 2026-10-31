-- Security hardening. Run after migrations 001–005 in the Supabase SQL Editor.
--
 Client roles use RPCs only; tables remain private behind RLS.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'surgeries', 'calculations', 'app_settings',
    'sales_patient_queue_entries', 'reconciliation_payables'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end;
$$;

-- Keep the existing self-profile read policy only. No browser role can read
-- financial or patient tables directly; all access is checked inside RPCs.
do $$
begin
  if to_regclass('public.profiles') is not null then
    grant select on table public.profiles to authenticated;
  end if;
end;
$$;

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

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;

create or replace function public.audit_surgery_mutation ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (
    actor_id, action, target_table, target_id, before_data, after_data
  ) values (
    auth.uid(),
    lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    coalesce(new.id, old.id)::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.surgeries') is not null then
    drop trigger if exists audit_surgery_mutation on public.surgeries;
    create trigger audit_surgery_mutation
    after insert or update or delete on public.surgeries
    for each row execute function public.audit_surgery_mutation();
  end if;
end;
$$;

create or replace function public.audit_app_setting_mutation ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (
    actor_id, action, target_table, target_id, before_data, after_data
  ) values (
    auth.uid(),
    lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    coalesce(new.key, old.key),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.app_settings') is not null then
    drop trigger if exists audit_app_setting_mutation on public.app_settings;
    create trigger audit_app_setting_mutation
    after insert or update or delete on public.app_settings
    for each row execute function public.audit_app_setting_mutation();
  end if;
end;
$$;

revoke all on function public.audit_surgery_mutation() from public;
revoke all on function public.audit_app_setting_mutation() from public;

-- Storage buckets are intentionally not created here. When you add an MOU
-- bucket in Supabase Dashboard, create it as private and expose it only via
-- short-lived signed URLs after an authenticated finance/admin authorization.
