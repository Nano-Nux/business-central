"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminLoading, AdminSignInRequired } from "../../components/admin-auth-state";
import { AdminShell } from "../../components/admin-shell";
import { createRole, deleteRole, listMerchants, listPermissions, listRoles, Merchant, Permission, Role, updateRole } from "../../lib/api";
import { useAdminSession } from "../../lib/use-admin-session";

type RoleForm = { code: string; name: string; permissionCodes: string[] };
const emptyForm: RoleForm = { code: "", name: "", permissionCodes: [] };

export default function RolesPage() {
  const { session, ready, withAuth } = useAdminSession();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantID, setMerchantID] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [editing, setEditing] = useState<Role | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    void Promise.all([withAuth((token) => listMerchants(token)), withAuth((token) => listPermissions(token))])
      .then(([merchantResult, permissionResult]) => {
        setMerchants(merchantResult.data);
        setMerchantID((current) => current || merchantResult.data[0]?.id || "");
        setPermissions(permissionResult.data);
      }).catch((cause: Error) => setError(cause.message));
  }, [session, withAuth]);

  useEffect(() => {
    if (!session || !merchantID) return;
    void withAuth((token) => listRoles(token, merchantID)).then((result) => setRoles(result.data)).catch((cause: Error) => setError(cause.message));
  }, [session, merchantID, withAuth]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!merchantID) return;
    setBusy(true);
    setError("");
    let saved = false;
    try {
      if (editing) {
        const result = await withAuth((token) => updateRole(token, merchantID, editing.id, { code: form.code, name: form.name, permission_codes: form.permissionCodes }));
        setRoles((items) => items.map((item) => item.id === editing.id ? result.data : item));
      } else {
        const result = await withAuth((token) => createRole(token, merchantID, { code: form.code, name: form.name, permission_codes: form.permissionCodes }));
        setRoles((items) => [...items, result.data].sort((left, right) => left.code.localeCompare(right.code)));
      }
      saved = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the role.");
    } finally {
      setBusy(false);
      if (saved) closeForm();
    }
  }

  async function remove(role: Role) {
    if (!window.confirm(`Delete the ${role.name} role? Assigned users will lose this role.`)) return;
    setBusy(true);
    setError("");
    try {
      await withAuth((token) => deleteRole(token, merchantID, role.id));
      setRoles((items) => items.filter((item) => item.id !== role.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete the role.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(role: Role) {
    setEditing(role);
    setForm({ code: role.code, name: role.name, permissionCodes: role.permission_codes || [] });
    setShowForm(true);
  }

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(false);
  }

  function togglePermission(code: string) {
    setForm((current) => ({ ...current, permissionCodes: current.permissionCodes.includes(code) ? current.permissionCodes.filter((value) => value !== code) : [...current.permissionCodes, code] }));
  }

  if (!ready) return <AdminLoading />;
  if (!session) return <AdminSignInRequired />;

  return <AdminShell session={session} active="roles">
    <header className="topbar"><div><p className="eyebrow">ROLE-BASED ACCESS</p><h1>Roles</h1><p className="muted">Manage merchant roles and the backend permissions each role grants.</p></div><button className="outline-button" disabled={busy} onClick={() => { if (!merchantID) { setError("Select a merchant before adding a role."); return; } setError(""); setEditing(null); setForm(emptyForm); setShowForm(true); }}>+ Add role</button></header>
    {error && <p className="error banner">{error}</p>}
    <section className="panel route-panel"><div className="panel-heading"><div><p className="eyebrow">MERCHANT ROLES</p><h2>{roles.length} roles</h2></div><label className="compact-field">Merchant<select value={merchantID} onChange={(event) => { setMerchantID(event.target.value); setRoles([]); }}><option value="">Select merchant</option>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></label></div><div className="data-list">{roles.map((role) => <div className="data-row" key={role.id}><span className="role-icon">{role.name[0]?.toUpperCase()}</span><span className="data-info"><strong>{role.name} {role.is_system && <span className="pill neutral">System</span>}</strong><small>{role.code} · {role.permission_codes?.join(", ") || "No permissions"}</small></span><button className="row-action" disabled={busy} onClick={() => openEdit(role)}>Edit</button>{!role.is_system && <button className="row-action danger-text" disabled={busy} onClick={() => remove(role)}>Delete</button>}</div>)}{merchantID && roles.length === 0 && <p className="empty">This merchant has no roles.</p>}</div></section>
    {showForm && <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="panel-heading"><div><p className="eyebrow">MERCHANT ROLE</p><h2>{editing ? "Edit role" : "Add role"}</h2></div><button type="button" className="close" onClick={closeForm}>×</button></div><label>Code<input required disabled={Boolean(editing?.is_system)} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toLowerCase() })} /></label><label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Permissions<details className="dropdown"><summary>{form.permissionCodes.length > 0 ? `${form.permissionCodes.length} selected` : "Select permissions"}</summary><div className="dropdown-menu">{permissions.map((permission) => <label className="check-option" key={permission.code}><input type="checkbox" checked={form.permissionCodes.includes(permission.code)} onChange={() => togglePermission(permission.code)} /><span><strong>{permission.code}</strong><small>{permission.description}</small></span></label>)}</div></details></label><button disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create role"}</button></form></div>}
  </AdminShell>;
}
