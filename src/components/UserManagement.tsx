import { useEffect, useState } from "react";
import type { UserRole } from "../types";
import {
  getManagedUsers,
  type ManagedUser,
  updateManagedUserRole,
} from "../services/userManagementService";
import { supabase } from "../lib/supabase";

const roles: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrator" },
  { value: "finance", label: "Finance" },
  { value: "offline_sales", label: "Offline Sales" },
  { value: "online_sales", label: "Online Sales" },
];

const dateLabel = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "—";

export function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      setUsers(await getManagedUsers());
    } catch {
      setMessage("Could not load users. Run migration 009 in Supabase, then refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateRole = async (user: ManagedUser, role: UserRole) => {
    setSavingId(user.id);
    setMessage("");
    try {
      await updateManagedUserRole(user.id, role);
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, role } : item)),
      );
      setMessage(`${user.fullName}'s role was updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this user's role.");
    } finally {
      setSavingId("");
    }
  };

  return (
    <main>
      <section className="card user-management">
        <div className="section-title">
          <div>
            <h1>User management</h1>
            <p className="form-help">
              Assign access roles for staff who already have a Supabase sign-in.
            </p>
          </div>
          <button className="secondary" onClick={() => void load()} disabled={loading}>
            Refresh users
          </button>
        </div>

        {!supabase ? (
          <p className="notice">Connect Supabase to manage live user accounts.</p>
        ) : loading ? (
          <div className="user-list-skeleton" aria-label="Loading users">
            <span /><span /><span />
          </div>
        ) : users.length ? (
          <div className="user-list">
            {users.map((user) => (
              <article className="user-row" key={user.id}>
                <div>
                  <strong>{user.fullName}</strong>
                  <span>{user.email || "Email unavailable"}</span>
                  <small>Joined {dateLabel(user.createdAt)}</small>
                </div>
                <label className="user-role-field">
                  <span>Access role</span>
                  <select
                    value={user.role}
                    disabled={savingId === user.id}
                    onChange={(event) => void updateRole(user, event.target.value as UserRole)}
                  >
                    {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                </label>
              </article>
            ))}
          </div>
        ) : (
          <p className="form-help">No Supabase users yet. Create the staff account in Supabase Authentication, then return here to set its role.</p>
        )}
        {message && <p className="status">{message}</p>}
      </section>
    </main>
  );
}
