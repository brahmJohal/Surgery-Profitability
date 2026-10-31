import { supabase } from "../lib/supabase";

export type FinanceWorkspace = {
  rules: unknown[];
  profiles: unknown[];
  payables: unknown[];
};

export async function loadFinanceWorkspace(): Promise<FinanceWorkspace | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("finance_load_workspace");
  if (error) throw error;
  const workspace = data as Partial<FinanceWorkspace> | null;
  return {
    rules: Array.isArray(workspace?.rules) ? workspace.rules : [],
    profiles: Array.isArray(workspace?.profiles) ? workspace.profiles : [],
    payables: Array.isArray(workspace?.payables) ? workspace.payables : [],
  };
}

export async function replaceFinanceWorkspaceCollection(
  collection: "rules" | "profiles" | "payables",
  items: unknown[],
) {
  if (!supabase) return;
  const functionName = {
    rules: "finance_replace_rules",
    profiles: "finance_replace_profiles",
    payables: "finance_replace_payables",
  }[collection];
  const { error } = await supabase.rpc(functionName, { p_items: items });
  if (error) throw error;
}
