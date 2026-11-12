/** Client for the account server (server/accounts.js). */

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const TOKEN_KEY = "gameme:token";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* private mode: stay logged in for this tab only */
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Same rule as the server: 3 to 16 letters, numbers or underscores. Returns a message, or null if fine. */
export function validateName(name: string): string | null {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name) || name.replace(/_/g, "").length < 3) {
    return "Use 3 to 16 letters, numbers or underscores.";
  }
  return null;
}

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const ctrl = new AbortController();
  // A sleeping free-tier server can take about a minute to wake up.
  const timer = setTimeout(() => ctrl.abort(), 70_000);
  try {
    const res = await fetch(BASE + path, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    let data: { error?: string; code?: string } | null = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) throw new ApiError(res.status, data?.error ?? `Server error (${res.status})`, data?.code);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "Can't reach the account server. Check your connection and try again.", "NETWORK");
  } finally {
    clearTimeout(timer);
  }
}

export type NameCheck = { available: boolean; reason?: string };

export const checkName = (name: string) => call<NameCheck>(`/api/name-available?name=${encodeURIComponent(name)}`);
export const register = (name: string, password: string) =>
  call<{ token: string; name: string }>("/api/register", { method: "POST", body: { name, password } });
export const login = (name: string, password: string) =>
  call<{ token: string; name: string }>("/api/login", { method: "POST", body: { name, password } });
export const me = (token: string) => call<{ name: string }>("/api/me", { token });
