import { describe, expect, it } from "vitest";

describe("settings navigation and route access rules", () => {
  const merchantOnlyRoutes = [
    "/accounts",
    "/catalog",
    "/reports",
    "/promotions",
    "/settings/payment-types",
    "/settings/merchant",
    "/settings/application",
    "/settings/tax-notes",
    "/settings/repair-specs",
    "/settings/staff",
  ];

  function evaluateRouteAccess(
    pathname: string,
    isMerchant: boolean,
  ): { allowed: boolean; redirect: string | null } {
    if (isMerchant) {
      return { allowed: true, redirect: null };
    }
    const isBlocked = merchantOnlyRoutes.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
    if (!isBlocked) {
      return { allowed: true, redirect: null };
    }
    return {
      allowed: false,
      redirect: pathname.startsWith("/settings") ? "/settings" : "/staff/dashboard",
    };
  }

  it("permits staff to access main settings, printer, and theme subsettings", () => {
    expect(evaluateRouteAccess("/settings", false)).toEqual({ allowed: true, redirect: null });
    expect(evaluateRouteAccess("/settings/printer", false)).toEqual({
      allowed: true,
      redirect: null,
    });
    expect(evaluateRouteAccess("/settings/theme", false)).toEqual({
      allowed: true,
      redirect: null,
    });
  });

  it("redirects staff from merchant-only settings to the main settings page", () => {
    expect(evaluateRouteAccess("/settings/merchant", false)).toEqual({
      allowed: false,
      redirect: "/settings",
    });
    expect(evaluateRouteAccess("/settings/payment-types", false)).toEqual({
      allowed: false,
      redirect: "/settings",
    });
    expect(evaluateRouteAccess("/settings/application", false)).toEqual({
      allowed: false,
      redirect: "/settings",
    });
    expect(evaluateRouteAccess("/settings/tax-notes", false)).toEqual({
      allowed: false,
      redirect: "/settings",
    });
    expect(evaluateRouteAccess("/settings/repair-specs", false)).toEqual({
      allowed: false,
      redirect: "/settings",
    });
    expect(evaluateRouteAccess("/settings/staff", false)).toEqual({
      allowed: false,
      redirect: "/settings",
    });
  });

  it("redirects staff from top-level merchant-only features to the staff dashboard", () => {
    expect(evaluateRouteAccess("/accounts", false)).toEqual({
      allowed: false,
      redirect: "/staff/dashboard",
    });
    expect(evaluateRouteAccess("/reports", false)).toEqual({
      allowed: false,
      redirect: "/staff/dashboard",
    });
    expect(evaluateRouteAccess("/promotions", false)).toEqual({
      allowed: false,
      redirect: "/staff/dashboard",
    });
  });

  it("allows merchant role full access to all settings and merchant routes", () => {
    expect(evaluateRouteAccess("/settings", true)).toEqual({ allowed: true, redirect: null });
    expect(evaluateRouteAccess("/settings/printer", true)).toEqual({
      allowed: true,
      redirect: null,
    });
    expect(evaluateRouteAccess("/settings/theme", true)).toEqual({
      allowed: true,
      redirect: null,
    });
    expect(evaluateRouteAccess("/settings/merchant", true)).toEqual({
      allowed: true,
      redirect: null,
    });
    expect(evaluateRouteAccess("/settings/payment-types", true)).toEqual({
      allowed: true,
      redirect: null,
    });
    expect(evaluateRouteAccess("/accounts", true)).toEqual({ allowed: true, redirect: null });
  });
});
