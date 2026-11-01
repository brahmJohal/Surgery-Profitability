import { type FormEvent, useEffect, useState } from "react";
import type { UserRole } from "../types";
import {
  getManagedUsers,
  createManagedUser,
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

const userError = (error: unknown, fallback: string) =>
  error && typeof error === "object" && "message" in error &&
  typeof error.message === "string"
    ? error.message
    : fallback;

export function UserManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "offline_sales" as UserRole,
  });

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      setUsers(await getManagedUsers());
    } catch (error) {
      setMessage(userError(error, "Could not load users. Please refresh and try again."));
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
      setMessage(userError(error, "Could not update this user's role."));
    } finally {
      setSavingId("");
    }
  };

  const addUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    try {
      await createManagedUser(newUser);
      setNewUser({ fullName: "", email: "", password: "", role: "offline_sales" });
      await load();
      setMessage("New staff account created. They can sign in with the password you set.");
    } catch (error) {
      setMessage(userError(error, "Could not create this staff account."));
    } finally {
      setCreating(false);
    }
  };

  return (
    <main>
      <section className="card user-management">
        <div className="section-title">
          <div>
            <h1>User management</h1>
            <p className="form-help">
              Administrator-only access. Create staff sign-ins and control their access roles here.
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
                    disabled={savingId === user.id || user.id === currentUserId}
                    onChange={(event) => void updateRole(user, event.target.value as UserRole)}
                  >
                    {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                  {user.id === currentUserId && <small>Your administrator role is protected.</small>}
                </label>
              </article>
            ))}
          </div>
        ) : (
          <p className="form-help">No Supabase users yet. Create the staff account in Supabase Authentication, then return here to set its role.</p>
        )}

        <form className="add-user-form" onSubmit={(event) => void addUser(event)}>
          <h2>Add new user</h2>
          <p className="form-help">Create a sign-in now. Share the password privately with the staff member.</p>
          <div className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input required value={newUser.fullName} onChange={(event) => setNewUser((value) => ({ ...value, fullName: event.target.value }))} placeholder="e.g. Riya Sharma" />
            </label>
            <label className="field">
              <span>Email address</span>
              <input required type="email" value={newUser.email} onChange={(event) => setNewUser((value) => ({ ...value, email: event.target.value }))} placeholder="staff@truehospitals.com" />
            </label>
            <label className="field">
              <span>Temporary password</span>
              <input required type="password" minLength={8} value={newUser.password} onChange={(event) => setNewUser((value) => ({ ...value, password: event.target.value }))} placeholder="Minimum 8 characters" />
            </label>
            <label className="field">
              <span>Access role</span>
              <select value={newUser.role} onChange={(event) => setNewUser((value) => ({ ...value, role: event.target.value as UserRole }))}>
                {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </label>
          </div>
          <button disabled={creating}>{creating ? "Creating user…" : "Add user"}</button>
        </form>
        {message && <p className="status">{message}</p>}
      </section>
    </main>
  );
}
