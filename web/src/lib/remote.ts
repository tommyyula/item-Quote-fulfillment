// Server mode: when the build sets VITE_API_BASE (Vercel), data lives in the API's Postgres database.
// Without it (GitHub Pages demo) the app keeps everything in this browser, as before.
import type { Customer, HistoryEvent, Quote } from "./types";

export const API_BASE: string = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/$/, "");
export const serverMode = API_BASE !== "";

export interface User { kind: "user" | "key"; id: string; email: string; name: string; role: string }
export interface Bootstrap {
  user: User; customers: Customer[]; history: HistoryEvent[];
  quotes: (Quote & { etag: string })[];
}
export interface AuthConfig { provider: "entra" | null; devLogin: boolean; domains: string[] }

export class ApiError extends Error {
  constructor(public status: number, public body: { title?: string; detail?: string } | null) {
    super(body?.detail || body?.title || `HTTP ${status}`);
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, keepalive = false) {
  const res = await fetch(`${API_BASE}${path}`, {
    method, credentials: "same-origin", keepalive,
    headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return { data: data as T, etag: res.headers.get("etag") };
}

/** null = not signed in. */
export async function loadBootstrap(): Promise<Bootstrap | null> {
  try {
    return (await api<Bootstrap>("GET", "/v1/app/bootstrap")).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}
export const authConfig = async () => (await api<AuthConfig>("GET", "/auth/config")).data;
export const signInUrl = () => `${API_BASE}/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
export async function signOut() {
  await api("POST", "/auth/logout").catch(() => {});
  location.reload();
}
