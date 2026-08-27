"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { BrandIcon } from "@/components/brand-icon";
import type { User } from "@/lib/types";

function dashboardFor(user: User) {
  const isMerchant = user.roles.some((role) => {
    const code = role.code.toUpperCase();
    return code === "OWNER" || code === "MERCHANT";
  });
  return isMerchant ? "/select-shop" : "/staff/dashboard";
}

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const suppressPasswordClickUntilRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ready && user) router.replace(dashboardFor(user));
  }, [ready, user, router]);

  function togglePasswordVisibility() {
    const input = passwordInputRef.current;
    const selectionStart = input?.selectionStart ?? password.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    setShowPassword((value) => !value);
    window.requestAnimationFrame(() => {
      const nextInput = passwordInputRef.current;
      nextInput?.focus({ preventScroll: true });
      nextInput?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const account = await login(email.trim(), password, merchantId.trim());
      router.replace(dashboardFor(account));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand brand-light">
          <span className="brand-mark">
            <BrandIcon />
          </span>
          <span>
            Business Central<small>Merchant workspace</small>
          </span>
        </div>
        <div className="story-copy">
          <span className="story-pill">
            <i />
            One clear view of your day
          </span>
          <h1>
            Run the shop.
            <br />
            <em>We’ll organize the rest.</em>
          </h1>
          <p>
            Sales, stock, repairs and your team—simple enough for the counter, complete enough for
            the owner.
          </p>
        </div>
        <div className="mini-dashboard">
          <div className="mini-top">
            <span>Your day, organized</span>
            <small>Live</small>
          </div>
          <div className="login-feature">
            <Icon name="cart" />
            <span>Sell at the counter</span>
          </div>
          <div className="login-feature">
            <Icon name="package" />
            <span>Know what is in stock</span>
          </div>
          <div className="login-feature">
            <Icon name="chart" />
            <span>See today’s result</span>
          </div>
        </div>
        <p className="story-foot">Built for busy local businesses</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-login-brand">
            <span className="brand-mark">
              <BrandIcon />
            </span>
            Business Central
          </div>
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to your workspace</h2>
          <p className="login-intro">Use your merchant or staff account to continue.</p>
          <form onSubmit={submit}>
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@yourshop.com"
                required
                autoFocus
              />
            </label>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <div className="password-field">
                <input
                  key={showPassword ? "visible-password" : "hidden-password"}
                  id="login-password"
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onTouchEnd={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    suppressPasswordClickUntilRef.current = Date.now() + 750;
                    togglePasswordVisibility();
                  }}
                  onClick={(event) => {
                    if (Date.now() < suppressPasswordClickUntilRef.current) {
                      event.preventDefault();
                      return;
                    }
                    togglePasswordVisibility();
                  }}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
                </button>
              </div>
            </div>
            <details className="merchant-id">
              <summary>Sign in to a specific merchant</summary>
              <label className="field">
                <span>Merchant ID</span>
                <input
                  value={merchantId}
                  onChange={(event) => setMerchantId(event.target.value)}
                  placeholder="Only needed for multi-merchant accounts"
                />
              </label>
            </details>
            {error && (
              <div className="form-error" role="alert">
                <Icon name="close" size={16} />
                {error}
              </div>
            )}
            <button className="login-submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in <Icon name="arrow" size={18} />
                </>
              )}
            </button>
          </form>
          <p className="login-help">Having trouble? Contact your merchant owner.</p>
        </div>
      </section>
    </main>
  );
}
