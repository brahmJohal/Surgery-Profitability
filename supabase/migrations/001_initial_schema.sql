-- Run this once in Supabase SQL Editor before connecting the web app.
-- All financial calculations happen inside PostgreSQL. Sales never receives old cost breakdowns.
create type public.user_role as enum ('admin', 'sales');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'sales',
  created_at timestamptz not null default now()
);

create table public.surgeries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  standard_billing numeric(12,2) not null default 0 check (standard_billing >= 0),
  pharma_cost numeric(12,2) not null default 0 check (pharma_cost >= 0),
  anaesthesia_cost numeric(12,2) not null default 0 check (anaesthesia_cost >= 0),
  lab_cost numeric(12,2) not null default 0 check (lab_cost >= 0),
  base_rental numeric(12,2) not null default 0 check (base_rental >= 0),
  other_fixed_cost numeric(12,2) not null default 0 check (other_fixed_cost >= 0),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calculations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id),
  surgery_id uuid not null references public.surgeries(id),
  billing numeric(12,2) not null check (billing >= 0),
  doctor_share numeric(12,2) not null default 0 check (doctor_share >= 0),
  referral_share numeric(12,2) not null default 0 check (referral_share >= 0),
  extra_rental numeric(12,2) not null default 0 check (extra_rental >= 0),
  fixed_cost numeric(12,2) not null default 0,
  profit numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.surgeries enable row level security;
alter table public.calculations enable row level security;
create policy "users can read their own profile" on public.profiles for select to authenticated using (auth.uid() = id);

-- No client role can directly select or write surgeries/calculations.
revoke all on table public.surgeries, public.calculations from anon, authenticated;

create function public.get_calculator_surgeries()
returns table (id uuid, name text, standard_billing numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query select s.id, s.name, s.standard_billing from public.surgeries s where s.active = true order by s.name;
end;
$$;

create function public.admin_list_surgeries()
returns table (id uuid, name text, standard_billing numeric, pharma_cost numeric, anaesthesia_cost numeric, lab_cost numeric, base_rental numeric, other_fixed_cost numeric, active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query select s.id, s.name, s.standard_billing, s.pharma_cost, s.anaesthesia_cost, s.lab_cost, s.base_rental, s.other_fixed_cost, s.active from public.surgeries s order by s.name;
end;
$$;

create function public.add_surgery(
  p_name text, p_standard_billing numeric, p_pharma_cost numeric, p_anaesthesia_cost numeric, p_lab_cost numeric, p_base_rental numeric, p_other_fixed_cost numeric
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Surgery name is required'; end if;
  if least(p_standard_billing, p_pharma_cost, p_anaesthesia_cost, p_lab_cost, p_base_rental, p_other_fixed_cost) < 0 then raise exception 'Amounts cannot be negative'; end if;
  insert into public.surgeries (name, standard_billing, pharma_cost, anaesthesia_cost, lab_cost, base_rental, other_fixed_cost, created_by)
  values (trim(p_name), p_standard_billing, p_pharma_cost, p_anaesthesia_cost, p_lab_cost, p_base_rental, p_other_fixed_cost, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create function public.admin_update_surgery(
  p_id uuid, p_name text, p_standard_billing numeric, p_pharma_cost numeric, p_anaesthesia_cost numeric, p_lab_cost numeric, p_base_rental numeric, p_other_fixed_cost numeric, p_active boolean
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if nullif(trim(p_name), '') is null or least(p_standard_billing, p_pharma_cost, p_anaesthesia_cost, p_lab_cost, p_base_rental, p_other_fixed_cost) < 0 then raise exception 'Invalid surgery values'; end if;
  update public.surgeries set name = trim(p_name), standard_billing = p_standard_billing, pharma_cost = p_pharma_cost, anaesthesia_cost = p_anaesthesia_cost, lab_cost = p_lab_cost, base_rental = p_base_rental, other_fixed_cost = p_other_fixed_cost, active = p_active, updated_by = auth.uid(), updated_at = now() where id = p_id;
  if not found then raise exception 'Surgery not found'; end if;
end;
$$;

create function public.calculate_surgery_profit(
  p_surgery_id uuid, p_billing numeric, p_doctor_share numeric, p_referral_share numeric, p_extra_rental numeric
)
returns table (profit numeric, margin numeric)
language plpgsql security definer set search_path = '' as $$
declare v_fixed_cost numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if least(p_billing, p_doctor_share, p_referral_share, p_extra_rental) < 0 then raise exception 'Amounts cannot be negative'; end if;
  select s.pharma_cost + s.anaesthesia_cost + s.lab_cost + s.base_rental + s.other_fixed_cost into v_fixed_cost from public.surgeries s where s.id = p_surgery_id and s.active = true;
  if v_fixed_cost is null then raise exception 'Surgery not found'; end if;
  return query select p_billing - v_fixed_cost - p_doctor_share - p_referral_share - p_extra_rental,
    case when p_billing = 0 then 0 else round(((p_billing - v_fixed_cost - p_doctor_share - p_referral_share - p_extra_rental) / p_billing) * 100, 2) end;
end;
$$;

create function public.create_surgery_calculation(
  p_surgery_id uuid, p_billing numeric, p_doctor_share numeric, p_referral_share numeric, p_extra_rental numeric
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_fixed_cost numeric; v_profit numeric; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if least(p_billing, p_doctor_share, p_referral_share, p_extra_rental) < 0 then raise exception 'Amounts cannot be negative'; end if;
  select s.pharma_cost + s.anaesthesia_cost + s.lab_cost + s.base_rental + s.other_fixed_cost into v_fixed_cost from public.surgeries s where s.id = p_surgery_id and s.active = true;
  if v_fixed_cost is null then raise exception 'Surgery not found'; end if;
  v_profit := p_billing - v_fixed_cost - p_doctor_share - p_referral_share - p_extra_rental;
  insert into public.calculations (created_by, surgery_id, billing, doctor_share, referral_share, extra_rental, fixed_cost, profit)
  values (auth.uid(), p_surgery_id, p_billing, p_doctor_share, p_referral_share, p_extra_rental, v_fixed_cost, v_profit) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.get_calculator_surgeries() from public;
revoke all on function public.admin_list_surgeries() from public;
revoke all on function public.add_surgery(text, numeric, numeric, numeric, numeric, numeric, numeric) from public;
revoke all on function public.admin_update_surgery(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, boolean) from public;
revoke all on function public.calculate_surgery_profit(uuid, numeric, numeric, numeric, numeric) from public;
revoke all on function public.create_surgery_calculation(uuid, numeric, numeric, numeric, numeric) from public;
grant execute on function public.get_calculator_surgeries() to authenticated;
grant execute on function public.admin_list_surgeries() to authenticated;
grant execute on function public.add_surgery(text, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.admin_update_surgery(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, boolean) to authenticated;
grant execute on function public.calculate_surgery_profit(uuid, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.create_surgery_calculation(uuid, numeric, numeric, numeric, numeric) to authenticated;

-- After creating the two users in Supabase Authentication, run this once:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'admin@truehospitals.com');
