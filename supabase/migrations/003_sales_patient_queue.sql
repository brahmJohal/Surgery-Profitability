-- Sales creates only the initial IPD queue request. Reception/Admin completes
-- doctor, ward, insurance, package, and admission information in the legacy HIS.
create table public.sales_patient_queue_entries (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id),
  full_name text not null check (nullif(trim(full_name), '') is not null),
  phone text not null check (phone ~ '^[0-9]{10}$'),
  gender text not null check (gender in ('female', 'male', 'other')),
  date_of_birth date not null check (date_of_birth <= current_date),
  registration_mode text not null default 'IPD' check (registration_mode = 'IPD'),
  registration_source public.user_role not null check (registration_source in ('online_sales', 'offline_sales')),
  doctor_name text,
  referral_name text,
  notes text,
  legacy_queue_status text not null default 'pending_sync' check (legacy_queue_status in ('pending_sync', 'synced', 'sync_failed')),
  legacy_queue_id text,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create index sales_patient_queue_entries_created_by_created_at_idx
  on public.sales_patient_queue_entries (created_by, created_at desc);

alter table public.sales_patient_queue_entries enable row level security;
revoke all on table public.sales_patient_queue_entries from anon, authenticated;

create function public.create_sales_patient_queue_entry(
  p_full_name text,
  p_phone text,
  p_gender text,
  p_date_of_birth date,
  p_doctor_name text default null,
  p_referral_name text default null,
  p_notes text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('online_sales', 'offline_sales') then raise exception 'Sales access required'; end if;
  if nullif(trim(p_full_name), '') is null then raise exception 'Patient name is required'; end if;
  if coalesce(p_phone, '') !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number'; end if;
  if p_gender not in ('female', 'male', 'other') then raise exception 'Select a valid gender'; end if;
  if p_date_of_birth is null or p_date_of_birth > current_date then raise exception 'Enter a valid date of birth'; end if;

  insert into public.sales_patient_queue_entries (full_name, phone, gender, date_of_birth, registration_source, doctor_name, referral_name, notes)
  values (trim(p_full_name), p_phone, p_gender, p_date_of_birth, v_role, nullif(trim(p_doctor_name), ''), nullif(trim(p_referral_name), ''), nullif(trim(p_notes), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.list_my_sales_patient_queue_entries()
returns table (id uuid, full_name text, phone text, doctor_name text, referral_name text, legacy_queue_status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select q.id, q.full_name, q.phone, q.doctor_name, q.referral_name, q.legacy_queue_status, q.created_at
  from public.sales_patient_queue_entries q where q.created_by = auth.uid() order by q.created_at desc;
$$;

revoke all on function public.create_sales_patient_queue_entry(text, text, text, date, text, text, text) from public;
revoke all on function public.list_my_sales_patient_queue_entries() from public;
grant execute on function public.create_sales_patient_queue_entry(text, text, text, date, text, text, text) to authenticated;
grant execute on function public.list_my_sales_patient_queue_entries() to authenticated;
