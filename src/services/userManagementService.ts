import { supabase } from "../lib/supabase";
import type { UserRole } from "../types";

export type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
};

export type NewManagedUser = {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
};

const supportedRoles: UserRole[] = [
  "admin",
  "finance",
  "offline_sales",
  "online_sales",
];

const normalizeRole = (value: string): UserRole =>
  supportedRoles.includes(value as UserRole)
    ? (value as UserRole)
    : "offline_sales";

async function invokeAdminUserService(body: Record<string, unknown>) {
  if (!supabase) throw new Error("Supabase is not connected.");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");

  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    const details = response
      ? await response.clone().json().catch(() => null) as { error?: string } | null
      : null;
    throw new Error(details?.error || error.message);
  }
  return data;
}

export async function getManagedUsers(): Promise<ManagedUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) throw error;
  const users = (data || []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    role: UserRole;
    created_at: string;
  }>;
  return users.map((user) => ({
    id: String(user.id),
    fullName: String(user.full_name || "Unnamed user"),
    email: String(user.email || ""),
    role: normalizeRole(String(user.role)),
    createdAt: String(user.created_at || ""),
  }));
}

export async function updateManagedUserRole(id: string, role: UserRole) {
  await invokeAdminUserService({ action: "update-role", userId: id, role });
}

export async function createManagedUser(user: NewManagedUser) {
  const data = await invokeAdminUserService({ action: "create-user", ...user });
  return data as { id: string };
}
