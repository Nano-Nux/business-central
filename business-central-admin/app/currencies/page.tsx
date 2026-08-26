"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminLoading, AdminSignInRequired } from "../../components/admin-auth-state";
import { AdminShell } from "../../components/admin-shell";
import { createCurrency, Currency, deleteCurrency, listAdminCurrencies, updateCurrency } from "../../lib/api";
import { useAdminSession } from "../../lib/use-admin-session";

type CurrencyForm = { code: string; name: string; symbol: string; decimal_places: number | string };
const emptyForm: CurrencyForm = { code: "", name: "", symbol: "", decimal_places: 2 };

export default function CurrenciesPage() {
  const { session, ready, withAuth } = useAdminSession();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [form, setForm] = useState<CurrencyForm>(emptyForm);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    void withAuth((token) => listAdminCurrencies(token)).then((result) => setCurrencies(result.data)).catch((cause: Error) => setError(cause.message));
  }, [session, withAuth]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    const decimalPlaces = typeof form.decimal_places === "string" && form.decimal_places.trim() === "" ? NaN : Number(form.decimal_places);
    if (!/^[A-Z]{3}$/.test(code)) {
      setError("Code must contain exactly three letters.");
      return;
    }
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
      setError("Decimal places must be a whole number between 0 and 6.");
      return;
    }
    setBusy(true);
    let saved = false;
    try {
      if (editing) {
        const result = await withAuth((token) => updateCurrency(token, editing.code, { name, symbol: form.symbol.trim(), decimal_places: decimalPlaces }));
        setCurrencies((items) => items.map((item) => item.code === editing.code ? result.data : item));
      } else {
        const symbol = form.symbol.trim();
        const result = await withAuth((token) => createCurrency(token, { code, name, symbol: symbol || undefined, decimal_places: decimalPlaces }));
        setCurrencies((items) => [...items, result.data].sort((left, right) => left.code.localeCompare(right.code)));
      }
      saved = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the currency.");
    } finally {
      setBusy(false);
      if (saved) closeForm();
    }
  }

  async function remove(currency: Currency) {
    if (!window.confirm(`Delete ${currency.code} — ${currency.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      await withAuth((token) => deleteCurrency(token, currency.code));
      setCurrencies((items) => items.filter((item) => item.code !== currency.code));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete the currency.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(currency: Currency) {
    setEditing(currency);
    setForm({ code: currency.code, name: currency.name, symbol: currency.symbol || "", decimal_places: currency.decimal_places });
    setShowForm(true);
  }

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(false);
  }

  if (!ready) return <AdminLoading />;
  if (!session) return <AdminSignInRequired />;

  return <AdminShell session={session} active="currencies">
    <header className="topbar"><div><p className="eyebrow">PLATFORM REFERENCE DATA</p><h1>Currencies</h1><p className="muted">Manage the currency codes available to merchant accounts.</p></div><button className="outline-button" disabled={busy} onClick={() => { setError(""); setEditing(null); setForm(emptyForm); setShowForm(true); }}>+ Add currency</button></header>
    {error && <p className="error banner">{error}</p>}
    <section className="panel route-panel"><div className="panel-heading"><div><p className="eyebrow">CURRENCY DIRECTORY</p><h2>{currencies.length} currencies</h2></div><span className="count">Backend records</span></div><div className="data-list">{currencies.map((currency) => <div className="data-row" key={currency.code}><span className="currency-symbol">{currency.symbol || currency.code}</span><span className="data-info"><strong>{currency.name}</strong><small>{currency.code} · {currency.decimal_places} decimal places</small></span><button className="row-action" disabled={busy} onClick={() => openEdit(currency)}>Edit</button><button className="row-action danger-text" disabled={busy} onClick={() => remove(currency)}>Delete</button></div>)}{currencies.length === 0 && <p className="empty">No currencies are configured.</p>}</div></section>
    {showForm && <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="panel-heading"><div><p className="eyebrow">CURRENCY</p><h2>{editing ? "Edit currency" : "Add currency"}</h2></div><button type="button" className="close" onClick={closeForm}>×</button></div><label>Code<input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" disabled={Boolean(editing)} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label><label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Symbol (optional)<input maxLength={10} value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} /></label><label>Decimal places<input required type="number" min={0} max={6} step={1} value={form.decimal_places} onChange={(event) => setForm({ ...form, decimal_places: event.target.value })} /></label><button disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create currency"}</button></form></div>}
  </AdminShell>;
}
