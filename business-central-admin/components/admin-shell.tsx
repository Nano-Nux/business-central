"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { Session } from "../lib/api";

export type AdminSection = "overview" | "users" | "currencies" | "business-types" | "roles" | "shops";

const navigation: { href: string; label: string; section: AdminSection }[] = [
  { href: "/", label: "Overview", section: "overview" },
  { href: "/users", label: "Users", section: "users" },
  { href: "/roles", label: "Roles", section: "roles" },
  { href: "/currencies", label: "Currencies", section: "currencies" },
  { href: "/business-types", label: "Business types", section: "business-types" },
  { href: "/shops", label: "Shops", section: "shops" },
];

export function AdminShell({ session, active, children }: { session: Session; active: AdminSection; children: ReactNode }) {
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark small">BC</span><span>Business Central</span></div><p className="eyebrow side-label">PLATFORM CONTROL</p><nav>{navigation.map((item) => <Link key={item.section} className={`nav-button ${active === item.section ? "active" : ""}`} href={item.href}>{item.label}</Link>)}</nav><div className="side-bottom"><div className="admin-chip"><span className="avatar">{session.user.email[0].toUpperCase()}</span><div><strong>{session.user.display_name}</strong><small>{session.user.email}</small></div></div><button className="link-button" onClick={() => { localStorage.removeItem("bc_admin_session"); window.location.href = "/login"; }}>Sign out</button></div></aside><section className="content">{children}</section></main>;
}
