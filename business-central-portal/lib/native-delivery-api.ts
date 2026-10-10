import { callNativeDatabase, usingFullyOfflineNativeDatabase } from "./native-database";
import type { ApiEnvelope, Session } from "./types";

export async function nativeDeliveryApi<T>(
  path: string,
  init: RequestInit,
): Promise<ApiEnvelope<T> | undefined> {
  if (!usingFullyOfflineNativeDatabase()) return undefined;
  const url = new URL(path, "http://native.local");
  const detail = /^\/transaction-history\/([^/]+)$/.exec(url.pathname);
  const update = /^\/pos\/orders\/([^/]+)\/delivery-payment$/.exec(url.pathname);
  const correction = /^\/pos\/orders\/([^/]+)$/.exec(url.pathname);
  const catalog = url.pathname === "/pos/catalog";
  const method = (init.method ?? "GET").toUpperCase();
  if (
    !(method === "GET" && (url.pathname === "/transaction-history" || detail)) &&
    !(method === "PATCH" && update) &&
    !(["PATCH", "DELETE"].includes(method) && correction) &&
    !(method === "GET" && catalog)
  )
    return undefined;
  const session = JSON.parse(localStorage.getItem("bc.session") ?? "null") as Session | null;
  if (!session?.user.merchant_id) throw new Error("An authenticated merchant scope is required.");
  const owner = session.user.roles.some(
    (role) => role.code === "merchant" || role.code === "owner",
  );
  if ((detail || update || correction) && !owner)
    throw new Error(
      "Only merchant administrators can modify or view complete transaction details.",
    );
  if (
    (update || correction) &&
    !session.user.roles.some((role) => role.permission_codes.includes("tenant.write"))
  )
    throw new Error("tenant.write permission is required.");
  const shop = session.user.shop_id || localStorage.getItem("bc.current-shop");
  if (!shop) throw new Error("Select a shop before accessing transaction history.");
  const payload = {
    ...((update || correction) && typeof init.body === "string" ? JSON.parse(init.body) : {}),
    merchant_id: session.user.merchant_id,
    shop_id: shop,
    membership_id: session.user.membership_id,
    ...(detail || update || correction ? { id: (detail ?? update ?? correction)![1] } : {}),
    page_index: Number(url.searchParams.get("page_index") ?? 0),
    page_size: Number(url.searchParams.get("page_size") ?? 10),
    query: url.searchParams.get("query") ?? "",
    filter: url.searchParams.get("filter") ?? "",
  };
  return callNativeDatabase<ApiEnvelope<T>>(
    correction
      ? method === "DELETE"
        ? "deleteTransaction"
        : "updateTransaction"
      : catalog
        ? "getTransactionCatalog"
        : update
          ? "updateDeliveryPayment"
          : detail
            ? "getTransactionHistoryDetail"
            : "getTransactionHistory",
    payload,
  );
}
