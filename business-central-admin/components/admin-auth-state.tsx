import Link from "next/link";

export function AdminLoading() {
  return <main className="login-shell"><p className="muted">Loading administrator session…</p></main>;
}

export function AdminSignInRequired() {
  return <main className="login-shell"><section className="login-card"><div className="brand-mark">BC</div><p className="eyebrow">PLATFORM CONTROL</p><h1>Sign-in required</h1><p className="muted">Your administrator session is missing or has expired. Sign in again to continue.</p><Link className="login-link" href="/login">Go to login</Link></section></main>;
}
