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
export type BusinessType = {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
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
export type BusinessCentralPricingModel =
  "starter" | "growth" | "professional" | "enterprise";
export type Merchant = {
  id: string;
  name: string;
  slug: string;
  legal_name?: string;
  default_currency_code: string;
  timezone?: string;
  country_code?: string;
  pos_complexity_level: "SIMPLE" | "COMPLEX" | "MINI";
  business_central_pricing_model: BusinessCentralPricingModel;
  ai_assistant_enabled?: boolean;
  ai_usage_limit?: number;
  ai_usage_count?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type MerchantBackup = {
  id: string;
  merchant_id: string;
  device_id: string;
  file_path: string;
  file_size_bytes: number;
  sha256_checksum: string;
  created_at: string;
};
export type TelegramGroup = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  shop_id: string;
  shop_name: string;
  telegram_chat_id: number;
  group_title: string;
  group_type: string;
  group_username?: string;
  creator_display_name_snapshot?: string;
  creator_username_snapshot?: string;
  connection_status: string;
  bot_membership_status: string;
  bot_admin_status: boolean;
  bot_permission_snapshot: Record<string, boolean>;
  member_count?: number;
  connected_at?: string;
  first_seen_at: string;
  last_seen_at: string;
  last_refreshed_at?: string;
  last_error?: string;
};
export type TelegramOrder = {
  id: string;
  merchant_id: string;
  shop_id: string;
  telegram_group_connection_id: string;
  group_title: string;
  order_number: string;
  status: string;
  currency_code: string;
  grand_total: string;
  customer_name?: string | null;
  payment_status?: string;
  items?: {
    line_number: number;
    description: string;
    sku: string;
    quantity: string;
    unit_price: string;
    line_total: string;
  }[];
  description: string;
  quantity: string;
  created_at: string;
  last_error?: string;
};
export type TelegramGroupUser = {
  telegram_user_id: number;
  display_name_snapshot?: string;
  username_snapshot?: string;
  telegram_role: string;
  can_create_orders: boolean;
  last_seen_at: string;
};
export type TelegramAuditEvent = {
  id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  actor_membership_id?: string;
  after_data?: Record<string, unknown>;
  occurred_at: string;
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

const rawBaseURL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1"
).replace(/\/$/, "");

const baseURL = rawBaseURL.endsWith("/api/v1")
  ? rawBaseURL
  : `${rawBaseURL}/api/v1`;

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
  data: {
    pos_complexity_level?: "SIMPLE" | "COMPLEX" | "MINI";
    business_central_pricing_model?: BusinessCentralPricingModel;
    default_currency_code?: string;
    name?: string;
    legal_name?: string | null;
    country_code?: string | null;
    ai_assistant_enabled?: boolean;
    ai_usage_limit?: number;
    ai_usage_count?: number;
    is_active?: boolean;
  },
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
    pos_complexity_level: "SIMPLE" | "COMPLEX" | "MINI";
    business_central_pricing_model?: BusinessCentralPricingModel;
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
export const listTelegramGroups = (token: string) =>
  request<{ data: TelegramGroup[] }>("/admin/telegram/groups", {}, token).then(
    (r) => r.data,
  );
export const listTelegramOrders = (token: string, connectionID = "") =>
  request<{ data: TelegramOrder[] }>(
    `/admin/telegram/orders${connectionID ? `?connection_id=${encodeURIComponent(connectionID)}` : ""}`,
    {},
    token,
  ).then((r) => r.data);
export const listTelegramGroupUsers = (token: string, id: string) =>
  request<{ data: TelegramGroupUser[] }>(
    `/admin/telegram/groups/${id}/users`,
    {},
    token,
  ).then((r) => r.data);
export const refreshTelegramGroup = (token: string, id: string) =>
  request<{ data: TelegramGroup }>(
    `/admin/telegram/groups/${id}/refresh`,
    { method: "POST", body: "{}" },
    token,
  ).then((r) => r.data);
export const setTelegramGroupStatus = (
  token: string,
  id: string,
  status: string,
) =>
  request<{ data: TelegramGroup }>(
    `/admin/telegram/groups/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    token,
  ).then((r) => r.data);
export const disconnectTelegramGroup = (token: string, id: string) =>
  request<void>(`/admin/telegram/groups/${id}`, { method: "DELETE" }, token);
export const rotateTelegramPairingCode = (token: string, id: string) =>
  request<{ data: { code: string; expires_at: string } }>(
    `/admin/telegram/groups/${id}/rotate-pairing-code`,
    { method: "POST", body: "{}" },
    token,
  ).then((r) => r.data);
export const revokeTelegramSeller = (
  token: string,
  id: string,
  userID: number,
) =>
  request<void>(
    `/admin/telegram/groups/${id}/users/${userID}/revoke`,
    { method: "POST", body: "{}" },
    token,
  );
export const listTelegramAudit = (token: string, id: string) =>
  request<{ data: TelegramAuditEvent[] }>(
    `/admin/telegram/groups/${id}/audit`,
    {},
    token,
  ).then((r) => r.data);
export const retryTelegramSynchronization = (token: string, id: string) =>
  request<void>(
    `/admin/telegram/groups/${id}/retry-sync`,
    { method: "POST", body: "{}" },
    token,
  );
export const listBusinessTypes = (token: string) =>
  request<{ data: BusinessType[] }>("/admin/business-types", {}, token);
export const createBusinessType = (
  token: string,
  data: {
    code: string;
    name: string;
    description?: string;
    is_active?: boolean;
  },
) =>
  request<{ data: BusinessType }>(
    "/admin/business-types",
    { method: "POST", body: JSON.stringify(data) },
    token,
  );
export const updateBusinessType = (
  token: string,
  id: string,
  data: Partial<Pick<BusinessType, "name" | "description" | "is_active">>,
) =>
  request<{ data: BusinessType }>(
    `/admin/business-types/${id}`,
    { method: "PATCH", body: JSON.stringify(data) },
    token,
  );
export const deleteBusinessType = (token: string, id: string) =>
  request<void>(`/admin/business-types/${id}`, { method: "DELETE" }, token);
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
  data: Omit<
    Shop,
    "id" | "merchant_id" | "module_codes" | "business_type_name"
  > & {
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
  data: Omit<
    Shop,
    "id" | "merchant_id" | "module_codes" | "business_type_name"
  > & {
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

export const listMerchantBackups = (token: string, merchantID: string) =>
  request<{ data: MerchantBackup[] }>(
    `/merchants/${merchantID}/backups`,
    {},
    token,
    merchantID,
  );

export const getBackupDownloadUrl = (merchantID: string, backupID: string) =>
  `${baseURL}/merchants/${merchantID}/backups/${backupID}/download`;

export async function backendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL.replace(/\/api\/v1$/, "")}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export type AIDeletionLog = {
  id: string;
  deleted_by_identity_id?: string;
  deleted_by_email: string;
  deleted_by_name: string;
  deleted_at: string;
  messages_count: number;
  conversations_count: number;
  created_at: string;
};

export type AIAdminStats = {
  total_messages: number;
  total_conversations: number;
  total_merchants_with_ai: number;
  last_deletion?: AIDeletionLog | null;
};

export type AIPurgeResult = {
  deleted_messages: number;
  deleted_conversations: number;
  log: AIDeletionLog;
};

export const getAIAdminStats = (token: string) =>
  request<{ data: AIAdminStats }>("/admin/ai/stats", {}, token).then(
    (r) => r.data,
  );

export const purgeAIChatMessages = (token: string) =>
  request<{ data: AIPurgeResult }>(
    "/admin/ai/purge",
    { method: "POST" },
    token,
  ).then((r) => r.data);

export const listAIDeletionLogs = (token: string, limit: number = 50) =>
  request<{ data: AIDeletionLog[]; meta: { total: number } }>(
    `/admin/ai/deletion-logs?limit=${limit}`,
    {},
    token,
  ).then((r) => r.data);

export type TelegramWebhookStatus = {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
  bot_username: string;
  token_configured: boolean;
  secret_configured: boolean;
  suggested_url: string;
};

export const getTelegramWebhookStatus = (token: string) =>
  request<{ data: TelegramWebhookStatus }>(
    "/admin/telegram/webhook",
    {},
    token,
  ).then((r) => r.data);

export const registerTelegramWebhook = (token: string, url: string) =>
  request<{ data: TelegramWebhookStatus }>(
    "/admin/telegram/webhook",
    {
      method: "POST",
      body: JSON.stringify({ url }),
    },
    token,
  ).then((r) => r.data);
