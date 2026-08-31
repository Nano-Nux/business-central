export type Role = {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
  permission_codes: string[];
};
export type Permission = { code: string; description?: string };
export type Currency = {
  code: string;
  name: string;
  symbol?: string;
  decimal_places: number;
};
export type BusinessType = { id: string; code: string; name: string; description: string; is_active: boolean; created_at: string; updated_at: string };
export type Shop = {
  id: string;
  merchant_id: string;
  business_type_id?: string;
  business_type_name?: string;
  name: string;
  code: string;
  address: Record<string, unknown>;
  timezone?: string;
  is_active: boolean;
  module_codes: string[];
};
export type User = {
  id: string;
  membership_id: string;
  merchant_id: string;
  email: string;
  display_name: string;
  phone?: string;
  is_active: boolean;
  platform_admin: boolean;
  super_admin?: boolean;
  roles: Role[];
  created_at: string;
  updated_at: string;
};
export type Merchant = {
  id: string;
  name: string;
  slug: string;
  legal_name?: string;
  default_currency_code: string;
  timezone: string;
  country_code?: string;
  pos_complexity_level: "SIMPLE" | "COMPLEX";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type MerchantUserProvisioning = {
  merchant: Merchant;
  user: User;
  role: Role;
};
export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  user: User;
};
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const baseURL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1"
).replace(/\/$/, "");

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  merchantID?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (merchantID) headers.set("X-Merchant-ID", merchantID);
  const response = await fetch(`${baseURL}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.code || "REQUEST_FAILED",
      body?.error?.message || "The request could not be completed.",
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function login(email: string, password: string): Promise<Session> {
  const result = await request<{ data: Session }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!result.data.user.platform_admin)
    throw new Error(
      "This account does not have platform administrator access.",
    );
  return result.data;
}
export const refreshSession = (refreshToken: string) =>
  request<{ data: Session }>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).then((result) => result.data);
export const logout = (token: string) =>
  request<void>("/auth/logout", { method: "POST" }, token);
export const listMerchants = (token: string) =>
  request<{ data: Merchant[]; meta: { total: number } }>(
    "/admin/merchants",
    {},
    token,
  );
export const updateMerchant = (
  token: string,
  merchantID: string,
  data: { pos_complexity_level?: "SIMPLE" | "COMPLEX" },
) =>
  request<{ data: Merchant }>(
    `/admin/merchants/${merchantID}`,
    { method: "PATCH", body: JSON.stringify(data) },
    token,
  );
export const listUsers = (token: string, merchantID: string) =>
  request<{ data: User[]; meta: { total: number } }>(
    "/users",
    {},
    token,
    merchantID,
  );
export const createUser = (
  token: string,
  merchantID: string,
  data: {
    email: string;
    password: string;
    display_name: string;
    phone?: string;
    role_ids: string[];
  },
) =>
  request<{ data: User }>(
    "/users",
    { method: "POST", body: JSON.stringify(data) },
    token,
    merchantID,
  );
export const createMerchantUser = (
  token: string,
  data: {
    merchant_name: string;
    merchant_slug: string;
    merchant_legal_name?: string;
    default_currency_code: string;
    merchant_country_code?: string;
    pos_complexity_level: "SIMPLE" | "COMPLEX";
    email: string;
    password: string;
    display_name: string;
    phone?: string;
  },
) =>
  request<{ data: MerchantUserProvisioning }>(
    "/admin/merchant-users",
    { method: "POST", body: JSON.stringify(data) },
    token,
  );
export const updateUser = (
  token: string,
  merchantID: string,
  id: string,
  data: Record<string, unknown>,
) =>
  request<{ data: User }>(
    `/users/${id}`,
    { method: "PATCH", body: JSON.stringify(data) },
    token,
    merchantID,
  );
export const deleteUser = (token: string, merchantID: string, id: string) =>
  request<void>(`/users/${id}`, { method: "DELETE" }, token, merchantID);
export const listCurrencies = () =>
  request<{ data: Currency[] }>("/currencies");
export const listAdminCurrencies = (token: string) =>
  request<{ data: Currency[] }>("/admin/currencies", {}, token);
export const createCurrency = (
  token: string,
  data: {
    code: string;
    name: string;
    symbol?: string;
    decimal_places: number;
  },
) =>
  request<{ data: Currency }>(
    "/admin/currencies",
    { method: "POST", body: JSON.stringify(data) },
    token,
  );
export const updateCurrency = (
  token: string,
  code: string,
  data: Partial<Omit<Currency, "code">>,
) =>
  request<{ data: Currency }>(
    `/admin/currencies/${code}`,
    { method: "PATCH", body: JSON.stringify(data) },
    token,
  );
export const deleteCurrency = (token: string, code: string) =>
  request<void>(`/admin/currencies/${code}`, { method: "DELETE" }, token);
export const listBusinessTypes = (token: string) => request<{ data: BusinessType[] }>("/admin/business-types", {}, token);
export const createBusinessType = (token: string, data: { code: string; name: string; description?: string; is_active?: boolean }) => request<{ data: BusinessType }>("/admin/business-types", { method: "POST", body: JSON.stringify(data) }, token);
export const updateBusinessType = (token: string, id: string, data: Partial<Pick<BusinessType, "name" | "description" | "is_active">>) => request<{ data: BusinessType }>(`/admin/business-types/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token);
export const deleteBusinessType = (token: string, id: string) => request<void>(`/admin/business-types/${id}`, { method: "DELETE" }, token);
export const listPermissions = (token: string) =>
  request<{ data: Permission[] }>("/admin/permissions", {}, token);
export const listRoles = (token: string, merchantID: string) =>
  request<{ data: Role[] }>(
    `/admin/merchants/${merchantID}/roles`,
    {},
    token,
    merchantID,
  );
export const createRole = (
  token: string,
  merchantID: string,
  data: { code: string; name: string; permission_codes: string[] },
) =>
  request<{ data: Role }>(
    `/admin/merchants/${merchantID}/roles`,
    { method: "POST", body: JSON.stringify(data) },
    token,
    merchantID,
  );
export const updateRole = (
  token: string,
  merchantID: string,
  roleID: string,
  data: { code?: string; name?: string; permission_codes?: string[] },
) =>
  request<{ data: Role }>(
    `/admin/merchants/${merchantID}/roles/${roleID}`,
    { method: "PATCH", body: JSON.stringify(data) },
    token,
    merchantID,
  );
export const deleteRole = (token: string, merchantID: string, roleID: string) =>
  request<void>(
    `/admin/merchants/${merchantID}/roles/${roleID}`,
    { method: "DELETE" },
    token,
    merchantID,
  );
export const listShops = (token: string, merchantID: string) =>
  request<{ data: Shop[]; meta: { total: number } }>(
    "/shops",
    {},
    token,
    merchantID,
  );
export const createShop = (
  token: string,
  merchantID: string,
  data: Omit<Shop, "id" | "merchant_id" | "module_codes" | "business_type_name"> & {
    module_codes: string[];
  },
) =>
  request<{ data: Shop }>(
    "/shops",
    { method: "POST", body: JSON.stringify(data) },
    token,
    merchantID,
  );
export const updateShop = (
  token: string,
  merchantID: string,
  shopID: string,
  data: Omit<Shop, "id" | "merchant_id" | "module_codes" | "business_type_name"> & {
    module_codes: string[];
  },
) =>
  request<{ data: Shop }>(
    `/shops/${shopID}`,
    { method: "PATCH", body: JSON.stringify(data) },
    token,
    merchantID,
  );
export const deleteShop = (token: string, merchantID: string, shopID: string) =>
  request<void>(`/shops/${shopID}`, { method: "DELETE" }, token, merchantID);
export async function backendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL.replace(/\/api\/v1$/, "")}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
