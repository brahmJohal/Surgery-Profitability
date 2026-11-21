import { supabase } from "../lib/supabase";

export type FinanceWorkspace = {
  rules: unknown[];
  profiles: unknown[];
  payables: unknown[];
};

let workspaceCache: { expiresAt: number; value: FinanceWorkspace } | null = null;
const workspaceCacheTtlMs = 30_000;

export async function loadFinanceWorkspace(): Promise<FinanceWorkspace | null> {
  if (!supabase) return null;
  if (workspaceCache && workspaceCache.expiresAt > Date.now()) {
    return structuredClone(workspaceCache.value);
  }
  const { data, error } = await supabase.rpc("finance_load_workspace");
  if (error) throw error;
  const workspace = data as Partial<FinanceWorkspace> | null;
  const value = {
    rules: Array.isArray(workspace?.rules) ? workspace.rules : [],
    profiles: Array.isArray(workspace?.profiles) ? workspace.profiles : [],
    payables: Array.isArray(workspace?.payables) ? workspace.payables : [],
  };
  workspaceCache = { value, expiresAt: Date.now() + workspaceCacheTtlMs };
  return structuredClone(value);
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
  workspaceCache = null;
}
