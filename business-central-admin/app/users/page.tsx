"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  AdminLoading,
  AdminSignInRequired,
} from "../../components/admin-auth-state";
import { AdminShell } from "../../components/admin-shell";
import {
  createMerchantUser,
  createUser,
  Currency,
  deleteUser,
  listCurrencies,
  listMerchants,
  listRoles,
  listUsers,
  Merchant,
  Role,
  updateUser,
  updateMerchant,
  User,
} from "../../lib/api";
import { useAdminSession } from "../../lib/use-admin-session";

type UserForm = {
  display_name: string;
  email: string;
  password: string;
  phone: string;
  roleIDs: string[];
  accountRole: string;
  is_active: boolean;
  merchant_name: string;
  merchant_slug: string;
  default_currency_code: string;
  merchant_country_code: string;
  pos_complexity_level: "SIMPLE" | "COMPLEX";
};
const emptyForm: UserForm = {
  display_name: "",
  email: "",
  password: "",
  phone: "",
  roleIDs: [],
  accountRole: "merchant",
  is_active: true,
  merchant_name: "",
  merchant_slug: "",
  default_currency_code: "",
  merchant_country_code: "",
  pos_complexity_level: "SIMPLE",
};

export default function UsersPage() {
  const { session, ready, withAuth } = useAdminSession();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantID, setMerchantID] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editing, setEditing] = useState<User | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!session) return;
    void withAuth((token) => listMerchants(token))
      .then((result) => {
        setMerchants(result.data);
        setMerchantID((current) => current || result.data[0]?.id || "");
      })
      .catch((cause: Error) => setError(cause.message));
  }, [session, withAuth]);

  useEffect(() => {
    void listCurrencies()
      .then((result) => setCurrencies(result.data))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (!session || !merchantID) return;
    void Promise.all([
      withAuth((token) => listUsers(token, merchantID)),
      withAuth((token) => listRoles(token, merchantID)),
    ])
      .then(([userResult, roleResult]) => {
        setUsers(userResult.data);
        setRoles(roleResult.data);
      })
      .catch((cause: Error) => setError(cause.message));
  }, [session, merchantID, withAuth]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing && (!merchantID || form.roleIDs.length === 0)) {
      setError("Select a merchant and at least one role.");
      return;
    }
    if (!editing && form.accountRole !== "merchant" && !merchantID) {
      setError("Please create a merchant first.");
      return;
    }
    setBusy(true);
    setError("");
    let saved = false;
    try {
      if (editing) {
        const data: Record<string, unknown> = {
          display_name: form.display_name,
          email: form.email,
          phone: form.phone || null,
          is_active: form.is_active,
          role_ids: form.roleIDs,
        };
        if (form.password) data.password = form.password;
        const result = await withAuth((token) =>
          updateUser(token, merchantID, editing.membership_id, data),
        );
        setUsers((items) =>
          items.map((item) =>
            item.membership_id === editing.membership_id ? result.data : item,
          ),
        );
        if (isMerchantRoleSelected()) {
          const merchantResult = await withAuth((token) =>
            updateMerchant(token, merchantID, {
              pos_complexity_level: form.pos_complexity_level,
            }),
          );
          setMerchants((items) =>
            items.map((item) => item.id === merchantID ? merchantResult.data : item),
          );
        }
      } else if (form.accountRole === "merchant") {
        if (
          !form.merchant_name ||
          !form.merchant_slug ||
          !form.default_currency_code
        ) {
          setError(
            "Merchant name, slug, and currency are required to create a merchant.",
          );
          return;
        }
        const result = await withAuth((token) =>
          createMerchantUser(token, {
            merchant_name: form.merchant_name,
            merchant_slug: form.merchant_slug,
            default_currency_code: form.default_currency_code,
            merchant_country_code: form.merchant_country_code || undefined,
            pos_complexity_level: form.pos_complexity_level,
            email: form.email,
            password: form.password,
            display_name: form.display_name,
            phone: form.phone || undefined,
          }),
        );
        setMerchants((items) => [...items, result.data.merchant]);
        setMerchantID(result.data.merchant.id);
        setUsers((items) => [result.data.user, ...items]);
        setRoles([result.data.role]);
      } else {
        if (!merchantID) {
          setError("Please create a merchant first.");
          return;
        }
        if (!roles.some((role) => role.id === form.accountRole)) {
          setError(
            "No roles are configured for the selected merchant. Create a role first.",
          );
          return;
        }
        const result = await withAuth((token) =>
          createUser(token, merchantID, {
            email: form.email,
            password: form.password,
            display_name: form.display_name,
            phone: form.phone || undefined,
            role_ids: [form.accountRole],
          }),
        );
        setUsers((items) => [result.data, ...items]);
      }
      saved = true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save the user.",
      );
    } finally {
      setBusy(false);
      if (saved) closeForm();
    }
  }

  async function deactivate(user: User) {
    setBusy(true);
    setError("");
    try {
      await withAuth((token) =>
        deleteUser(token, merchantID, user.membership_id),
      );
      setUsers((items) =>
        items.map((item) =>
          item.membership_id === user.membership_id
            ? { ...item, is_active: false }
            : item,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to deactivate the user.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function activate(user: User) {
    setBusy(true);
    setError("");
    try {
      const result = await withAuth((token) =>
        updateUser(token, merchantID, user.membership_id, { is_active: true }),
      );
      setUsers((items) =>
        items.map((item) =>
          item.membership_id === user.membership_id ? result.data : item,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to activate the user.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({
      ...emptyForm,
      display_name: user.display_name,
      email: user.email,
      phone: user.phone || "",
      roleIDs: user.roles.map((role) => role.id),
      accountRole: user.roles[0]?.id || "",
      pos_complexity_level:
        merchants.find((merchant) => merchant.id === merchantID)
          ?.pos_complexity_level || "SIMPLE",
      is_active: user.is_active,
    });
    setShowForm(true);
  }

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(false);
  }

  function toggleRole(roleID: string) {
    setForm((current) => ({
      ...current,
      roleIDs: current.roleIDs.includes(roleID)
        ? current.roleIDs.filter((id) => id !== roleID)
        : [...current.roleIDs, roleID],
    }));
  }

  function isMerchantRoleSelected() {
    return form.roleIDs.some((roleID) => {
      const role = roles.find((item) => item.id === roleID);
      return role?.code.toUpperCase() === "MERCHANT" || role?.code.toUpperCase() === "OWNER";
    });
  }

  const selectedRoleNames = roles
    .filter((role) => form.roleIDs.includes(role.id))
    .map((role) => role.name);

  if (!ready) return <AdminLoading />;
  if (!session) return <AdminSignInRequired />;

  return (
    <AdminShell session={session} active="users">
      <header className="topbar">
        <div>
          <p className="eyebrow">IDENTITY & ACCESS</p>
          <h1>Users</h1>
          <p className="muted">
            Create merchant owner accounts or manage users inside an existing
            merchant.
          </p>
        </div>
        <button
          className="outline-button"
          disabled={busy}
          onClick={() => {
            setError("");
            setEditing(null);
            setForm(emptyForm);
            setShowForm(true);
          }}
        >
          + Add user
        </button>
      </header>
      {error && <p className="error banner">{error}</p>}
      <section className="panel route-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">MERCHANT MEMBERSHIPS</p>
            <h2>{users.length} users</h2>
          </div>
          <label className="compact-field">
            Merchant
            <select
              value={merchantID}
              onChange={(event) => {
                setMerchantID(event.target.value);
                setUsers([]);
                setRoles([]);
              }}
            >
              <option value="">Select merchant</option>
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="user-list">
          {users.map((user) => (
            <div className="user-row" key={user.membership_id}>
              <span className="avatar">
                {user.display_name[0]?.toUpperCase()}
              </span>
              <span className="user-info">
                <strong>{user.display_name}</strong>
                <small>
                  {user.email} ·{" "}
                  {user.roles.map((role) => role.name).join(", ") ||
                    "No assigned role"}
                </small>
              </span>
              <span className={`pill ${user.is_active ? "success" : "danger"}`}>
                {user.is_active ? "Active" : "Inactive"}
              </span>
              <button
                className="row-action"
                disabled={busy}
                onClick={() => openEdit(user)}
              >
                Edit
              </button>
              {user.is_active ? (
                <button
                  className="row-action danger-text"
                  disabled={busy}
                  onClick={() => deactivate(user)}
                >
                  Deactivate
                </button>
              ) : (
                <button
                  className="row-action"
                  disabled={busy}
                  onClick={() => activate(user)}
                >
                  Activate
                </button>
              )}
            </div>
          ))}
          {merchantID && users.length === 0 && (
            <p className="empty">This merchant has no users.</p>
          )}
        </div>
      </section>
      {showForm && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={save}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">USER ACCESS</p>
                <h2>{editing ? "Edit user" : "Add user"}</h2>
              </div>
              <button type="button" className="close" onClick={closeForm}>
                ×
              </button>
            </div>
            {!editing && (
              <label>
                Role
                <select
                  value={form.accountRole}
                  onChange={(event) => {
                    setForm({ ...form, accountRole: event.target.value });
                    setError("");
                  }}
                >
                  <option value="merchant">Merchant</option>
                  {roles.length > 0 ? (
                    roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="manager">Manager</option>
                      <option value="staff">Staff</option>
                    </>
                  )}
                </select>
              </label>
            )}
            {!editing && form.accountRole !== "merchant" && !merchantID && (
              <p className="error banner">
                Please create a merchant first before creating this user.
              </p>
            )}
            {!editing &&
              form.accountRole !== "merchant" &&
              merchantID &&
              roles.length === 0 && (
                <p className="error banner">
                  No roles are configured for this merchant.{" "}
                  <Link href="/roles">Create a role</Link> first.
                </p>
              )}
            <label>
              Display name
              <input
                required
                value={form.display_name}
                onChange={(event) =>
                  setForm({ ...form, display_name: event.target.value })
                }
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
              />
            </label>
            <label>
              {editing ? "New password (optional)" : "Password"}
              <input
                required={!editing}
                minLength={8}
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
              />
            </label>
            <label>
              Phone (optional)
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />
            </label>
            {!editing && form.accountRole === "merchant" && (
              <>
                <p className="eyebrow form-section-label">MERCHANT DETAILS</p>
                <label>
                  Merchant name
                  <input
                    required
                    value={form.merchant_name}
                    onChange={(event) =>
                      setForm({ ...form, merchant_name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Merchant slug
                  <input
                    required
                    value={form.merchant_slug}
                    onChange={(event) =>
                      setForm({ ...form, merchant_slug: event.target.value })
                    }
                  />
                </label>
                <label>
                  Default currency
                  <select
                    required
                    value={form.default_currency_code}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        default_currency_code: event.target.value,
                      })
                    }
                  >
                    <option value="">Select currency</option>
                    {currencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.code} — {currency.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Country code (optional)
                  <input
                    maxLength={2}
                    value={form.merchant_country_code}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        merchant_country_code: event.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>
              </>
            )}
            {((!editing && form.accountRole === "merchant") ||
              (editing && isMerchantRoleSelected())) && (
              <fieldset className="pos-complexity-section">
                <legend>POS complexity level</legend>
                <p>Choose how much catalog and variant setup this merchant sees.</p>
                <label className="pos-complexity-option">
                  <input type="radio" name="pos_complexity_level" value="SIMPLE" checked={form.pos_complexity_level === "SIMPLE"} onChange={() => setForm({ ...form, pos_complexity_level: "SIMPLE" })} />
                  <span><strong>POS simple</strong><small>Each product automatically uses one standard variant.</small></span>
                </label>
                <label className="pos-complexity-option">
                  <input type="radio" name="pos_complexity_level" value="COMPLEX" checked={form.pos_complexity_level === "COMPLEX"} onChange={() => setForm({ ...form, pos_complexity_level: "COMPLEX" })} />
                  <span><strong>POS complex</strong><small>Keep separate variants, SKUs, units, and prices.</small></span>
                </label>
              </fieldset>
            )}
            {editing && (
              <label>
                Roles
                <details className="dropdown">
                  <summary>
                    {selectedRoleNames.length > 0
                      ? selectedRoleNames.join(", ")
                      : "Select roles"}
                  </summary>
                  <div className="dropdown-menu">
                    {roles.map((role) => (
                      <label className="check-option" key={role.id}>
                        <input
                          type="checkbox"
                          checked={form.roleIDs.includes(role.id)}
                          onChange={() => toggleRole(role.id)}
                        />
                        <span>{role.name}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </label>
            )}
            {editing && (
              <label>
                Status
                <select
                  value={form.is_active ? "active" : "inactive"}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      is_active: event.target.value === "active" ? true : false,
                    })
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            )}
            <button disabled={busy}>
              {busy
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : form.accountRole === "merchant"
                    ? "Create merchant"
                    : "Create user"}
            </button>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
