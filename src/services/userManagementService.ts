import { supabase } from "../lib/supabase";
import type { UserRole } from "../types";

export type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
};

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
    role: user.role as UserRole,
    createdAt: String(user.created_at || ""),
  }));
}

export async function updateManagedUserRole(id: string, role: UserRole) {
  if (!supabase) return;
  const { error } = await supabase.rpc("admin_update_user_role", {
    p_user_id: id,
    p_role: role,
  });
  if (error) throw error;
}
