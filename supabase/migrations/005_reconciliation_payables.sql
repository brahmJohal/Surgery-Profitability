create table public.reconciliation_payables (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id),
  payee_name text not null check (nullif(trim(payee_name), '') is not null),
  payable_type text not null check (payable_type in ('doctor', 'partner_referral', 'vendor', 'lab', 'rental', 'implant', 'other')),
  patient_case_reference text,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  tds_amount numeric(12,2) not null default 0 check (tds_amount >= 0 and tds_amount <= gross_amount),
  net_amount numeric(12,2) generated always as (gross_amount - tds_amount) stored,
  bank_account_holder text,
  bank_account_number text,
  bank_ifsc text,
  upi_id text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'paid', 'on_hold')),
  payment_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reconciliation_payables_status_created_at_idx on public.reconciliation_payables (status, created_at desc);
alter table public.reconciliation_payables enable row level security;
revoke all on table public.reconciliation_payables from anon, authenticated;

create function public.is_finance_or_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'finance'));
$$;

create function public.finance_list_payables()
returns table (id uuid, payee_name text, payable_type text, patient_case_reference text, gross_amount numeric, tds_amount numeric, net_amount numeric, status text, payment_reference text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_finance_or_admin() then raise exception 'Finance access required'; end if;
  return query select p.id, p.payee_name, p.payable_type, p.patient_case_reference, p.gross_amount, p.tds_amount, p.net_amount, p.status, p.payment_reference, p.created_at from public.reconciliation_payables p order by p.created_at desc;
end;
$$;

revoke all on function public.is_finance_or_admin() from public;
revoke all on function public.finance_list_payables() from public;
grant execute on function public.finance_list_payables() to authenticated;
