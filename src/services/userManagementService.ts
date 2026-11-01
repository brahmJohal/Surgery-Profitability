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
  if (!supabase) throw new Error("Supabase is not connected.");
  const { error } = await supabase.functions.invoke("admin-user-management", {
    body: { action: "update-role", userId: id, role },
  });
  if (error) throw error;
}

export async function createManagedUser(user: NewManagedUser) {
  if (!supabase) throw new Error("Supabase is not connected.");
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: { action: "create-user", ...user },
  });
  if (error) throw error;
  return data as { id: string };
}
