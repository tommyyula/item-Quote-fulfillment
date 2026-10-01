// Sign-in: Microsoft Entra ID (OIDC authorization code + PKCE, single tenant) restricted to company e-mail domains.
// Browsers get an HttpOnly session cookie; integrations send `X-API-Key`.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import type { Db } from "./db/client";
import { apiKeys, users } from "./db/schema";
import { newId, nowIso, Problem, type Env, type Principal } from "./http";

const SESSION = "uq_session";
const OIDC = "uq_oidc";
const SESSION_HOURS = 12;

const env = (k: string) => process.env[k] ?? "";
const allowedDomains = () => (env("AUTH_ALLOWED_DOMAINS") || "unisco.com").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const admins = () => env("ADMIN_EMAILS").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
export const emailAllowed = (email: string) => {
  const e = email.toLowerCase();
  return e.includes("@") && allowedDomains().some(d => e.endsWith(`@${d}`));
};
const devLoginEnabled = () => env("AUTH_DEV_LOGIN") === "1" && env("VERCEL_ENV") !== "production";
const entraConfigured = () => !!(env("ENTRA_TENANT_ID") && env("ENTRA_CLIENT_ID") && env("ENTRA_CLIENT_SECRET"));

function secret(): Uint8Array {
  const s = env("SESSION_SECRET");
  if (s.length < 32) throw new Problem(500, "Server misconfigured", "SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}
const b64url = (b: Buffer) => b.toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Public origin as the browser sees it (Vercel terminates TLS, so the function itself receives http). */
function publicOrigin(c: Context) {
  const u = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto")?.split(",")[0].trim() || u.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host")?.split(",")[0].trim() || u.host;
  return `${proto}://${host}`;
}
const secureCookie = (c: Context) => publicOrigin(c).startsWith("https:");
async function sign(claims: Record<string, unknown>, ttl: string) {
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(secret());
}
async function verify<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret(), { algorithms: ["HS256"] })).payload as T;
  } catch {
    return null;
  }
}

/** Only same-site relative paths, so the sign-in redirect cannot be turned into an open redirect. */
const safeReturn = (p: string | undefined) => (p && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/");
const origin = (c: Context) => env("APP_URL") || publicOrigin(c);
const redirectUri = (c: Context) => `${origin(c)}/api/auth/callback`;

async function upsertUser(db: Db, email: string, name: string): Promise<Principal> {
  const e = email.toLowerCase();
  const role = admins().includes(e) ? "admin" : "user";
  const [existing] = await db.select().from(users).where(eq(users.email, e));
  if (existing) {
    const nextRole = existing.role === "admin" || role === "admin" ? "admin" : "user";
    await db.update(users).set({ name: name || existing.name, role: nextRole, lastLoginAt: nowIso() }).where(eq(users.id, existing.id));
    return { kind: "user", id: existing.id, email: e, name: name || existing.name, role: nextRole };
  }
  const id = newId();
  await db.insert(users).values({ id, email: e, name, role, lastLoginAt: nowIso() });
  return { kind: "user", id, email: e, name, role };
}

async function startSession(c: Context, p: Principal) {
  const token = await sign({ sub: p.id, email: p.email, name: p.name, role: p.role }, `${SESSION_HOURS}h`);
  setCookie(c, SESSION, token, { httpOnly: true, secure: secureCookie(c), sameSite: "Lax", path: "/", maxAge: SESSION_HOURS * 3600 });
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
const entraJwks = () => (jwks ??= createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${env("ENTRA_TENANT_ID")}/discovery/v2.0/keys`)));

export function authRoutes(db: Db) {
  const r = new Hono<Env>();

  r.get("/config", c => c.json({ provider: entraConfigured() ? "entra" : null, devLogin: devLoginEnabled(), domains: allowedDomains() }));

  r.get("/login", async c => {
    if (!entraConfigured()) throw new Problem(503, "Sign-in not configured", "Microsoft Entra ID app registration is not set up yet");
    const state = b64url(randomBytes(24)), nonce = b64url(randomBytes(24)), verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    setCookie(c, OIDC, await sign({ state, nonce, verifier, returnTo: safeReturn(c.req.query("returnTo")) }, "10m"),
      { httpOnly: true, secure: secureCookie(c), sameSite: "Lax", path: "/api/auth", maxAge: 600 });
    const u = new URL(`https://login.microsoftonline.com/${env("ENTRA_TENANT_ID")}/oauth2/v2.0/authorize`);
    u.search = new URLSearchParams({
      client_id: env("ENTRA_CLIENT_ID"), response_type: "code", redirect_uri: redirectUri(c), response_mode: "query",
      scope: "openid profile email", state, nonce, code_challenge: challenge, code_challenge_method: "S256",
      ...(c.req.query("hint") ? { login_hint: c.req.query("hint")! } : {}),
    }).toString();
    return c.redirect(u.toString());
  });

  r.get("/callback", async c => {
    const fail = (why: string) => c.redirect(`/?signin_error=${encodeURIComponent(why)}`);
    const flow = await verify<{ state: string; nonce: string; verifier: string; returnTo: string }>(getCookie(c, OIDC));
    deleteCookie(c, OIDC, { path: "/api/auth" });
    if (c.req.query("error")) return fail(c.req.query("error_description") || c.req.query("error")!);
    if (!flow || flow.state !== c.req.query("state")) return fail("Sign-in expired, please try again");
    const res = await fetch(`https://login.microsoftonline.com/${env("ENTRA_TENANT_ID")}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("ENTRA_CLIENT_ID"), client_secret: env("ENTRA_CLIENT_SECRET"), grant_type: "authorization_code",
        code: c.req.query("code") ?? "", redirect_uri: redirectUri(c), code_verifier: flow.verifier, scope: "openid profile email",
      }),
    });
    const tok = (await res.json()) as { id_token?: string; error_description?: string };
    if (!res.ok || !tok.id_token) return fail(tok.error_description?.split("\n")[0] || "Token exchange failed");
    let claims: Record<string, unknown>;
    try {
      claims = (await jwtVerify(tok.id_token, entraJwks(), {
        issuer: `https://login.microsoftonline.com/${env("ENTRA_TENANT_ID")}/v2.0`, audience: env("ENTRA_CLIENT_ID"),
      })).payload;
    } catch {
      return fail("Could not verify the Microsoft sign-in");
    }
    if (claims.nonce !== flow.nonce || claims.tid !== env("ENTRA_TENANT_ID")) return fail("Sign-in did not come from the company directory");
    const email = String(claims.email || claims.preferred_username || "");
    if (!emailAllowed(email)) return fail(`${email || "This account"} is not a company account`);
    await startSession(c, await upsertUser(db, email, String(claims.name || "")));
    return c.redirect(flow.returnTo || "/");
  });

  /** Local development only (never in production): sign in as a company address without Entra. */
  r.post("/dev-login", async c => {
    if (!devLoginEnabled()) throw new Problem(404, "Not found");
    const { email = "", name = "" } = (await c.req.json().catch(() => ({}))) as { email?: string; name?: string };
    if (!emailAllowed(email)) throw new Problem(403, "Forbidden", `Only ${allowedDomains().join(", ")} addresses`);
    const p = await upsertUser(db, email, name || email.split("@")[0]);
    await startSession(c, p);
    return c.json(p);
  });

  r.get("/me", async c => {
    const p = await sessionPrincipal(c);
    if (!p) throw new Problem(401, "Unauthorized", "Not signed in");
    return c.json(p);
  });

  r.post("/logout", c => {
    deleteCookie(c, SESSION, { path: "/" });
    return c.body(null, 204);
  });
  return r;
}

async function sessionPrincipal(c: Context): Promise<Principal | null> {
  const s = await verify<{ sub: string; email: string; name: string; role: string }>(getCookie(c, SESSION));
  return s ? { kind: "user", id: s.sub, email: s.email, name: s.name, role: s.role } : null;
}

/** API key format: `uqk_<prefix>_<secret>`; looked up by SHA-256 of the whole key. */
export function generateApiKey() {
  const prefix = b64url(randomBytes(4));
  const key = `uqk_${prefix}_${b64url(randomBytes(24))}`;
  return { key, prefix, hash: sha256(key) };
}

export function requireAuth(db: Db): MiddlewareHandler<Env> {
  return async (c, next) => {
    const key = c.req.header("x-api-key");
    if (key) {
      const [k] = await db.select().from(apiKeys).where(and(eq(apiKeys.hash, sha256(key)), isNull(apiKeys.revokedAt)));
      if (!k) throw new Problem(401, "Unauthorized", "Invalid or revoked API key");
      c.set("principal", { kind: "key", id: k.id, email: `api-key:${k.name}`, name: k.name, role: "user" });
      // best effort, not awaited by the response path
      db.update(apiKeys).set({ lastUsedAt: nowIso() }).where(eq(apiKeys.id, k.id)).catch(() => {});
      return next();
    }
    const p = await sessionPrincipal(c);
    if (!p) throw new Problem(401, "Unauthorized", "Sign in, or send an X-API-Key header");
    c.set("principal", p);
    return next();
  };
}

export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.get("principal")?.role !== "admin") throw new Problem(403, "Forbidden", "Administrators only");
  return next();
};
