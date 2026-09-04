"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useShop } from "@/lib/shop";
import { useOffline } from "@/lib/offline";
import { patch } from "@/lib/api";
import { Badge, Button, Field, Form, Loading, PageHeader } from "./ui";
import { Icon } from "./icons";
import type { User } from "@/lib/types";

export function UserProfilePage() {
  const { user, merchant, isMerchant, ready } = useAuth();
  const { currentShop } = useShop();
  const offline = useOffline();

  // Profile info state
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  if (!ready || !user) {
    return (
      <main className="screen-center">
        <Loading />
      </main>
    );
  }

  const initials = user.display_name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleName = isMerchant ? "Merchant Owner" : user.roles.map((r) => r.name).join(", ") || "Staff";

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (offline.status === "offline") {
      setProfileError("Profile changes require an active internet connection.");
      return;
    }
    setProfileError("");
    setProfileSuccess("");
    setProfileSaving(true);
    try {
      const updated = await patch<User>(`/users/${user.membership_id}`, {
        display_name: displayName.trim(),
        phone: phone.trim() || null,
      });
      setProfileSuccess("Personal profile updated successfully.");
      // If local session exists, update display_name in storage
      const saved = localStorage.getItem("bc.session");
      if (saved) {
        try {
          const session = JSON.parse(saved);
          session.user = { ...session.user, display_name: updated.display_name, phone: updated.phone };
          localStorage.setItem("bc.session", JSON.stringify(session));
          window.dispatchEvent(new CustomEvent("bc-session", { detail: session }));
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (!isMerchant) {
      setPasswordError("Staff passwords can only be changed by the merchant administrator.");
      return;
    }
    if (offline.status === "offline") {
      setPasswordError("Password changes require an active internet connection.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordError("");
    setPasswordSuccess("");
    setPasswordSaving(true);
    try {
      await patch(`/users/${user.membership_id}`, {
        password: newPassword,
      });
      setPasswordSuccess("Password updated successfully. Please remember your new password.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="User profile"
        description="Manage your personal account details, preferences, and workspace credentials."
      />

      <div className="profile-page-grid" style={{ display: "grid", gap: "12px" }}>
        {/* Profile Hero Header Card */}
        <section
          className="card"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "14px",
            padding: "14px 18px",
            background: "linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(16,185,129,0.04) 100%)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: isMerchant
                ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                : "linear-gradient(135deg, #059669, #047857)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              fontWeight: 750,
              letterSpacing: "0.05em",
              boxShadow: "0 2px 8px rgba(37,99,235,0.2)",
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: "180px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "2px" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 750 }}>{user.display_name}</h2>
              <Badge tone={isMerchant ? "success" : "info"}>{roleName}</Badge>
              <Badge tone={user.is_active ? "success" : "danger"}>
                {user.is_active ? "Active account" : "Inactive"}
              </Badge>
            </div>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "12px" }}>
              {user.email} {user.phone ? `· ${user.phone}` : ""}
            </p>
            <div style={{ marginTop: "4px", display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "11px", color: "var(--muted)" }}>
              <span>
                <strong>Merchant:</strong> {merchant?.name || "Business Central"}
              </span>
              {currentShop && (
                <span>
                  <strong>Assigned shop:</strong> {currentShop.name}
                </span>
              )}
            </div>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
          {/* Card 1: Personal Details */}
          <section className="card" style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span className="stat-icon blue" style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px" }}>
                <Icon name="user" size={15} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>Personal Information</h3>
                <small style={{ color: "var(--muted)", fontSize: "11px" }}>Your name and contact details</small>
              </div>
            </div>

            {profileError && (
              <div style={{ padding: "8px 10px", marginBottom: "10px", borderRadius: "6px", backgroundColor: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: "11px", border: "1px solid var(--status-danger-border)" }}>
                {profileError}
              </div>
            )}
            {profileSuccess && (
              <div style={{ padding: "8px 10px", marginBottom: "10px", borderRadius: "6px", backgroundColor: "var(--status-success-soft)", color: "var(--status-success)", fontSize: "11px", border: "1px solid var(--status-success-border)" }}>
                {profileSuccess}
              </div>
            )}

            <Form onSubmit={handleUpdateProfile}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Field label="Email address" hint="Email is managed centrally and used for sign-in">
                  <input type="email" value={user.email} disabled style={{ backgroundColor: "var(--surface-muted)", cursor: "not-allowed" }} />
                </Field>

                <Field label="Display name" hint="How your name appears across orders, receipts, and staff lists">
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                  />
                </Field>

                <Field label="Phone number" hint="Optional mobile number for team communication">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +1 555 123 4567"
                  />
                </Field>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={profileSaving || offline.status === "offline"}
                    icon="check"
                  >
                    {profileSaving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </div>
            </Form>
          </section>

          {/* Card 2: Password & Security */}
          <section className="card" style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span className="stat-icon amber" style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px" }}>
                <Icon name="lock" size={15} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>Password & Security</h3>
                <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                  {isMerchant ? "Change your account sign-in password" : "Staff credential policy"}
                </small>
              </div>
            </div>

            {isMerchant ? (
              <>
                {passwordError && (
                  <div style={{ padding: "8px 10px", marginBottom: "10px", borderRadius: "6px", backgroundColor: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: "11px", border: "1px solid var(--status-danger-border)" }}>
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div style={{ padding: "8px 10px", marginBottom: "10px", borderRadius: "6px", backgroundColor: "var(--status-success-soft)", color: "var(--status-success)", fontSize: "11px", border: "1px solid var(--status-success-border)" }}>
                    {passwordSuccess}
                  </div>
                )}

                <Form onSubmit={handleChangePassword}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <Field label="New password" hint="Minimum 8 characters">
                      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={8}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          style={{ paddingRight: "2.5rem", width: "100%" }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          style={{
                            position: "absolute",
                            right: "0.5rem",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--muted)",
                            display: "flex",
                            alignItems: "center",
                            padding: "0.25rem",
                          }}
                        >
                          <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
                        </button>
                      </div>
                    </Field>

                    <Field label="Confirm new password" hint="Retype your new password">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                      />
                    </Field>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={passwordSaving || offline.status === "offline" || !newPassword}
                        icon="lock"
                      >
                        {passwordSaving ? "Updating password..." : "Change password"}
                      </Button>
                    </div>
                  </div>
                </Form>
              </>
            ) : (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(37,99,235,0.04)",
                  border: "1px solid rgba(37,99,235,0.15)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--status-info)", fontWeight: 700, fontSize: "12px" }}>
                  <Icon name="lock" size={15} />
                  <span>Managed Credentials</span>
                </div>
                <p style={{ margin: 0, fontSize: "11px", color: "var(--text)", lineHeight: 1.45 }}>
                  As a staff member, your account password and access rights are managed directly by your merchant administrator.
                </p>
                <p style={{ margin: 0, fontSize: "10px", color: "var(--muted)" }}>
                  If you need to change your password or suspect unauthorized access, please contact your merchant owner to reset your credentials.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
