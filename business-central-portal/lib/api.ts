import type { ApiEnvelope, Session } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

type ApiErrorBody = {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export class NetworkUnavailableError extends Error {
  constructor(message = "The Business Central backend is unavailable.") {
    super(message);
    this.name = "NetworkUnavailableError";
  }
}

function signalConnectivity(available: boolean) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bc-connectivity", { detail: { available } }));
  }
}

async function networkFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const response = await fetch(input, init);
    signalConnectivity(true);
    return response;
  } catch (error) {
    signalConnectivity(false);
    throw new NetworkUnavailableError(
      error instanceof Error && error.message
        ? `The Business Central backend is unavailable: ${error.message}`
        : undefined,
    );
  }
}

function token() {
  if (typeof window === "undefined") return "";
  try {
    const session = JSON.parse(localStorage.getItem("bc.session") ?? "null") as Session | null;
    return session?.access_token ?? "";
  } catch {
    return "";
  }
}

let refreshRequest: Promise<string> | null = null;
const inFlightMutations = new Map<string, Promise<ApiEnvelope<unknown>>>();

async function refreshAccessToken(): Promise<string> {
  if (refreshRequest) return refreshRequest;
  refreshRequest = (async () => {
    const saved = JSON.parse(localStorage.getItem("bc.session") ?? "null") as Session | null;
    if (!saved?.refresh_token) throw new Error("Your session has expired. Please sign in again.");
    const response = await networkFetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: saved.refresh_token }),
      cache: "no-store",
    });
    if (!response.ok) {
      // An expired or revoked session must lock network access, but unresolved
      // operations remain durable until the same scoped user reauthenticates
      // or explicitly confirms disposal during sign-out.
      localStorage.removeItem("bc.session");
      window.dispatchEvent(new CustomEvent("bc-session", { detail: null }));
      throw new Error("Your session has expired. Please sign in again.");
    }
    const body = (await response.json()) as ApiEnvelope<Session>;
    localStorage.setItem("bc.session", JSON.stringify(body.data));
    window.dispatchEvent(new CustomEvent("bc-session", { detail: body.data }));
    return body.data.access_token;
  })().finally(() => {
    refreshRequest = null;
  });
  return refreshRequest;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<ApiEnvelope<T>> {
  const method = (init.method ?? "GET").toUpperCase();
  if (
    method !== "GET" &&
    method !== "HEAD" &&
    typeof navigator !== "undefined" &&
    !navigator.onLine
  ) {
    throw new NetworkUnavailableError(
      path.startsWith("/sync/")
        ? "Offline changes remain saved and synchronization will resume when the backend is reachable."
        : "This action requires an internet connection and was not queued.",
    );
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const accessToken = token();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await networkFetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (response.status === 401 && !retried && path !== "/auth/login" && path !== "/auth/refresh") {
    const refreshed = await refreshAccessToken();
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("Authorization", `Bearer ${refreshed}`);
    return request<T>(path, { ...init, headers: retryHeaders }, true);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      response.status,
      body.error?.code ?? "REQUEST_FAILED",
      body.error?.message ?? "Something went wrong. Please try again.",
      body.error?.fields,
    );
  }
  if (response.status === 204) return { data: undefined as T };
  const body = (await response.json()) as ApiEnvelope<T>;
  return body;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || init.body instanceof FormData) {
    return (await request<T>(path, init, retried)).data;
  }
  const key = `${method}:${path}:${typeof init.body === "string" ? init.body : ""}`;
  const existing = inFlightMutations.get(key);
  if (existing) return (await existing).data as T;
  const pending = request<T>(path, init, retried);
  inFlightMutations.set(key, pending as Promise<ApiEnvelope<unknown>>);
  try {
    return (await pending).data;
  } finally {
    if (inFlightMutations.get(key) === pending) inFlightMutations.delete(key);
  }
}

export function apiPage<T>(path: string) {
  return request<T>(path);
}

export function list<T>(path: string) {
  return api<T[]>(path);
}

export function post<T>(path: string, data: unknown) {
  return api<T>(path, { method: "POST", body: JSON.stringify(data) });
}

export function patch<T>(path: string, data: unknown) {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(data) });
}

export function remove(path: string) {
  return api<void>(path, { method: "DELETE" });
}

export function upload<T>(path: string, data: FormData) {
  // Image uploads go to the backend. The backend adds the private
  // SeaweedFS Authorization header; never expose that service credential in
  // NEXT_PUBLIC_* variables or send it from the browser.
  return api<T>(path, { method: "POST", body: data });
}
