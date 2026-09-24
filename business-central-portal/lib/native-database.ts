/**
 * Native Database Bridge client for Business Central Mobile.
 *
 * When hosted inside business_central_mobile in offline-first mode,
 * this bridge sends database queries and transactions across the
 * JavaScript channel to the local Drift SQLite database on device storage.
 */

export type NativeDatabaseRequest = {
  id: string;
  method: string;
  payload?: Record<string, unknown>;
};

export type NativeDatabaseBridge = {
  query: (method: string, payload?: Record<string, unknown>) => Promise<unknown>;
  isAvailable: () => boolean;
};

type PendingCallback = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

declare global {
  interface Window {
    BusinessCentralDatabaseChannel?: {
      postMessage: (message: string) => void;
    };
    BusinessCentralNativeDatabase?: NativeDatabaseBridge;
    __businessCentralNativeDatabaseResolve?: (
      id: string,
      result: unknown,
      error: string | null,
    ) => void;
  }
}

const pendingRequests = new Map<string, PendingCallback>();
let requestIdCounter = 1;

function initNativeDatabaseGlobal() {
  if (typeof window === "undefined") return;

  const prevResolver = window.__businessCentralNativeDatabaseResolve;
  window.__businessCentralNativeDatabaseResolve = (id, result, error) => {
    const pending = pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(id);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
      return;
    }
    if (typeof prevResolver === "function") {
      prevResolver(id, result, error);
    }
  };
}

initNativeDatabaseGlobal();

export function usingNativeDatabaseBridge(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.BusinessCentralNativeDatabase || window.BusinessCentralDatabaseChannel);
}

export function callNativeDatabase<T = unknown>(
  method: string,
  payload?: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<T> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Native database is unavailable on server."));
  }

  // If a mock bridge is directly mounted (e.g. for unit testing):
  if (window.BusinessCentralNativeDatabase) {
    return window.BusinessCentralNativeDatabase.query(method, payload) as Promise<T>;
  }

  const channel = window.BusinessCentralDatabaseChannel;
  if (!channel) {
    return Promise.reject(
      new Error("BusinessCentralDatabaseChannel is not attached to this WebView."),
    );
  }

  initNativeDatabaseGlobal();

  const id = `db_req_${Date.now()}_${requestIdCounter++}`;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Native database request '${method}' timed out.`));
    }, timeoutMs);

    pendingRequests.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
    });

    try {
      const message = JSON.stringify({
        id,
        method,
        payload: payload || {},
      });
      channel.postMessage(message);
    } catch (err) {
      clearTimeout(timer);
      pendingRequests.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

// Typed Database Operations
export const nativeDb = {
  // Catalog & Products
  getProducts: (search?: string, categoryId?: string) =>
    callNativeDatabase<any[]>("getProducts", { search, categoryId }),

  saveProduct: (product: Record<string, unknown>) =>
    callNativeDatabase<any>("saveProduct", { product }),

  deleteProduct: (id: string) => callNativeDatabase<boolean>("deleteProduct", { id }),

  // Customers
  getCustomers: (search?: string) => callNativeDatabase<any[]>("getCustomers", { search }),

  saveCustomer: (customer: Record<string, unknown>) =>
    callNativeDatabase<any>("saveCustomer", { customer }),

  // POS Checkout (Atomic order creation + stock deduction)
  checkout: (orderData: Record<string, unknown>) =>
    callNativeDatabase<{ order_id: string; order_number: string }>("checkout", {
      order: orderData,
    }),

  // Orders
  getOrders: (limit = 50, offset = 0) => callNativeDatabase<any[]>("getOrders", { limit, offset }),

  getOrder: (id: string) => callNativeDatabase<any | null>("getOrder", { id }),

  // Settings
  getSetting: (key: string) => callNativeDatabase<string | null>("getSetting", { key }),

  saveSetting: (key: string, value: string) =>
    callNativeDatabase<boolean>("saveSetting", { key, value }),

  // Raw SQL escape-hatch for complex reporting
  query: (sql: string, params: unknown[] = []) =>
    callNativeDatabase<any[]>("rawQuery", { sql, params }),

  execute: (sql: string, params: unknown[] = []) =>
    callNativeDatabase<number>("rawExecute", { sql, params }),
};
