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
    const isFocused = typeof document !== "undefined" && document.activeElement === input;
    const selectionStart = input?.selectionStart ?? password.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    setShowPassword((value) => !value);
    if (isFocused) {
      window.requestAnimationFrame(() => {
        const nextInput = passwordInputRef.current;
        nextInput?.focus({ preventScroll: true });
        nextInput?.setSelectionRange(selectionStart, selectionEnd);
      });
    }
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
    <main className="login-page min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(420px,46%)_1fr] bg-canvas text-ink">
      <section className="login-story hidden lg:flex flex-col justify-between p-12 bg-theme-gray-950 text-white relative overflow-hidden">
        <div className="brand brand-light flex items-center gap-3 text-white">
          <span className="brand-mark flex items-center justify-center w-10 h-10 rounded-xl bg-white text-ink">
            <BrandIcon />
          </span>
          <span className="flex flex-col">
            <span className="font-bold text-base tracking-tight">Business Central</span>
            <small className="text-xs text-theme-gray-400">Merchant workspace</small>
          </span>
        </div>
        <div className="story-copy my-auto py-8">
          <span className="story-pill inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-white border border-white/15 mb-6">
            <i className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
            One clear view of your day
          </span>
          <h1 className="text-4xl sm:text-5xl font-serif font-medium tracking-tight text-white leading-tight mb-4">
            Run the shop.
            <br />
            <em className="italic text-theme-gray-300">We’ll organize the rest.</em>
          </h1>
          <p className="text-sm sm:text-base text-theme-gray-300 max-w-md leading-relaxed">
            Sales, stock, repairs and your team—simple enough for the counter, complete enough for
            the owner.
          </p>
        </div>
        <div className="mini-dashboard p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md max-w-sm space-y-3">
          <div className="mini-top flex items-center justify-between text-xs text-theme-gray-400 pb-2 border-b border-white/10">
            <span>Your day, organized</span>
            <small className="px-2 py-0.5 rounded-full bg-white/10 text-white font-semibold">
              Live
            </small>
          </div>
          <div className="login-feature flex items-center gap-3 text-sm text-white">
            <Icon name="cart" />
            <span>Sell at the counter</span>
          </div>
          <div className="login-feature flex items-center gap-3 text-sm text-white">
            <Icon name="package" />
            <span>Know what is in stock</span>
          </div>
          <div className="login-feature flex items-center gap-3 text-sm text-white">
            <Icon name="chart" />
            <span>See today’s result</span>
          </div>
        </div>
        <p className="story-foot text-xs text-theme-gray-500">Built for busy local businesses</p>
      </section>
      <section className="login-panel flex items-center justify-center p-6 sm:p-10">
        <div className="login-card w-full max-w-md p-6 sm:p-10 rounded-2xl bg-paper border border-line shadow-portal">
          <div className="mobile-login-brand flex lg:hidden items-center gap-2.5 font-bold text-base text-ink mb-6">
            <span className="brand-mark flex items-center justify-center w-8 h-8 rounded-lg bg-ink text-paper">
              <BrandIcon />
            </span>
            Business Central
          </div>
          <p className="eyebrow text-[10px] font-bold uppercase tracking-wider text-muted mb-1">
            Welcome back
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-ink m-0 mb-2">
            Sign in to your workspace
          </h2>
          <p className="login-intro text-sm text-muted mb-6">
            Use your merchant or staff account to continue.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <label className="field flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                Email address
              </span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@yourshop.com"
                required
                autoFocus
                className="w-full h-11 px-3.5 text-sm bg-canvas border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 focus:bg-paper transition"
              />
            </label>
            <div className="field flex flex-col gap-1.5">
              <label
                className="text-xs font-semibold text-muted uppercase tracking-wider"
                htmlFor="login-password"
              >
                Password
              </label>
              <div className="password-field relative flex items-center">
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
                  className="w-full h-11 pl-3.5 pr-12 text-sm bg-canvas border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 focus:bg-paper transition"
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
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
                  <Icon name={showPassword ? "eye-off" : "eye"} size={20} />
                </button>
              </div>
            </div>
            <details className="merchant-id text-xs text-muted cursor-pointer my-2">
              <summary className="font-medium hover:text-ink">
                Sign in to a specific merchant
              </summary>
              <label className="field flex flex-col gap-1.5 mt-2">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Merchant ID
                </span>
                <input
                  value={merchantId}
                  onChange={(event) => setMerchantId(event.target.value)}
                  placeholder="Only needed for multi-merchant accounts"
                  className="w-full h-10 px-3 text-xs bg-canvas border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 focus:bg-paper transition"
                />
              </label>
            </details>
            {error && (
              <div
                className="form-error flex items-center gap-2 p-3 rounded-lg text-xs font-medium bg-status-danger-soft text-status-danger border border-status-danger-border my-4"
                role="alert"
              >
                <Icon name="close" size={16} />
                {error}
              </div>
            )}
            <button
              className="login-submit w-full h-11 mt-4 flex items-center justify-center gap-2 rounded-lg bg-ink text-paper text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-50 disabled:cursor-wait cursor-pointer"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner w-4 h-4 border-2 border-paper border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in <Icon name="arrow" size={18} />
                </>
              )}
            </button>
          </form>
          <p className="login-help text-center text-xs text-muted mt-6">
            Having trouble? Contact your merchant owner.
          </p>
        </div>
      </section>
    </main>
  );
}
