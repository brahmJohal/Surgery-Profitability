-- Finance workspace lists are sorted by updated_at in finance_load_workspace.
-- These indexes keep the protected workspace fast as MOU rules and payouts grow.
create index if not exists finance_mou_rules_updated_at_idx
  on public.finance_mou_rules (updated_at);

create index if not exists finance_payee_profiles_updated_at_idx
  on public.finance_payee_profiles (updated_at);

create index if not exists finance_workspace_payables_updated_at_idx
  on public.finance_workspace_payables (updated_at desc);
