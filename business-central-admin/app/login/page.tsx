"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await login(email, password);
      localStorage.setItem("bc_admin_session", JSON.stringify(session));
      router.push("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">BC</div>
        <p className="eyebrow">PLATFORM CONTROL</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in with your platform administrator account.</p>
        {error && <p className="error banner">{error}</p>}
        <form onSubmit={submit}>
          <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="login-foot"><Link href="/">Return to admin</Link></p>
      </section>
    </main>
  );
}
