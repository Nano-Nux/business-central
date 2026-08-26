"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminLoading, AdminSignInRequired } from "../components/admin-auth-state";
import { AdminShell } from "../components/admin-shell";
import { backendHealth, listMerchants, Merchant } from "../lib/api";
import { useAdminSession } from "../lib/use-admin-session";

export default function Home() {
  const { session, ready, withAuth } = useAdminSession();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [error, setError] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);
  const [today, setToday] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setToday(new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date())), 0);
    void backendHealth().then(setOnline);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    void withAuth((token) => listMerchants(token)).then((result) => setMerchants(result.data)).catch((cause: Error) => setError(cause.message));
  }, [session, withAuth]);

  if (!ready) return <AdminLoading />;
  if (!session) return <AdminSignInRequired />;

  return <AdminShell session={session} active="overview">
    <header className="topbar"><div><p className="eyebrow">{today || "Loading date…"}</p><h1>Platform overview</h1><p className="muted">Manage platform reference data and merchant-scoped operations from the backend system of record.</p></div><div className="status"><span className={online === false ? "offline" : ""} /> {online === null ? "Checking backend…" : online ? "Backend connected" : "Backend unavailable"}</div></header>
    {error && <p className="error banner">{error}</p>}
    <section className="stats"><article><span className="stat-label">Total merchants</span><strong>{merchants.length}</strong><small>Available as management scopes</small></article><article><span className="stat-label">Active merchants</span><strong>{merchants.filter((merchant) => merchant.is_active).length}</strong><small>Currently enabled</small></article><article><span className="stat-label">Admin identity</span><strong>{session.user.platform_admin ? "Verified" : "Denied"}</strong><small>Backend authorization</small></article></section>
    <section className="panel route-panel"><div className="panel-heading"><div><p className="eyebrow">PLATFORM OPERATIONS</p><h2>Administration</h2></div></div><div className="admin-actions"><Link className="admin-action" href="/users"><strong>Users</strong><small>Create users, assign roles, and manage merchant memberships.</small><span>Open user management →</span></Link><Link className="admin-action" href="/roles"><strong>Roles</strong><small>Manage merchant roles and permission assignments.</small><span>Open role management →</span></Link><Link className="admin-action" href="/currencies"><strong>Currencies</strong><small>Manage supported platform currency records.</small><span>Open currency management →</span></Link><Link className="admin-action" href="/shops"><strong>Shops</strong><small>Manage shops inside their merchant tenant.</small><span>Open shop management →</span></Link></div></section>
  </AdminShell>;
}
