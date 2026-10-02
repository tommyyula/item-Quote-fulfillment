// End-to-end API tests against a real Postgres (PGlite, in memory) with the production migrations.
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { Db } from "./db/client";
import { ensureStandardTemplate } from "./db/seed";
import { catalog } from "./domain";
import { memoryDb } from "./testdb";

process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdefghij";
process.env.AUTH_DEV_LOGIN = "1";
process.env.ADMIN_EMAILS = "admin@unisco.com";
process.env.AUTH_ALLOWED_DOMAINS = "unisco.com";

let db: Db;
let app: ReturnType<typeof createApp>;
let cookie = "", adminCookie = "";

const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, as = cookie) => {
  const res = await app.request(`/api${path}`, {
    method, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(as ? { cookie: as } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
};
const login = async (email: string) => {
  const res = await app.request("/api/auth/dev-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")!.split(";")[0];
};

beforeAll(async () => {
  db = await memoryDb();
  expect(await ensureStandardTemplate(db)).toBe("created");
  expect(await ensureStandardTemplate(db)).toBe("unchanged");
  app = createApp(db);
  cookie = await login("sales@unisco.com");
  adminCookie = await login("admin@unisco.com");
}, 60_000);

describe("auth", () => {
  it("rejects anonymous calls with a problem document", async () => {
    const r = await call("GET", "/v1/customers", undefined, {}, "");
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).toContain("application/problem+json");
  });
  it("only company addresses can sign in", async () => {
    const res = await app.request("/api/auth/dev-login", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "someone@gmail.com" }) });
    expect(res.status).toBe(403);
  });
  it("dev login is off in production", async () => {
    process.env.VERCEL_ENV = "production";
    const res = await app.request("/api/auth/dev-login", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@unisco.com" }) });
    delete process.env.VERCEL_ENV;
    expect(res.status).toBe(404);
  });
  it("me returns the signed-in user and role", async () => {
    expect((await call("GET", "/auth/me")).body).toMatchObject({ email: "sales@unisco.com", role: "user" });
    expect((await call("GET", "/auth/me", undefined, {}, adminCookie)).body).toMatchObject({ role: "admin" });
  });
  it("API keys: admin only, shown once, usable, revocable", async () => {
    expect((await call("POST", "/v1/admin/api-keys", { name: "ERP" })).status).toBe(403);
    const k = await call("POST", "/v1/admin/api-keys", { name: "ERP" }, {}, adminCookie);
    expect(k.status).toBe(201);
    expect(k.body.key).toMatch(/^uqk_/);
    const viaKey = await call("GET", "/v1/customers", undefined, { "x-api-key": k.body.key }, "");
    expect(viaKey.status).toBe(200);
    expect((await call("DELETE", `/v1/admin/api-keys/${k.body.id}`, undefined, {}, adminCookie)).status).toBe(204);
    expect((await call("GET", "/v1/customers", undefined, { "x-api-key": k.body.key }, "")).status).toBe(401);
  });
});

describe("customers", () => {
  it("CRUD with ETag / If-Match", async () => {
    const created = await call("POST", "/v1/customers", { company: "Test Co", channel: "B2B", email: "ops@test.example" });
    expect(created.status).toBe(201);
    const id = created.body.id, tag = created.headers.get("etag")!;
    expect((await call("POST", "/v1/customers", { company: "" })).status).toBe(422);
    const patched = await call("PATCH", `/v1/customers/${id}`, { city: "Dallas" }, { "if-match": tag });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ company: "Test Co", city: "Dallas" });
    expect((await call("PATCH", `/v1/customers/${id}`, { city: "Austin" }, { "if-match": tag })).status).toBe(412);
    const list = await call("GET", "/v1/customers?q=test");
    expect(list.body.items.map((c: { id: string }) => c.id)).toContain(id);
    expect((await call("DELETE", `/v1/customers/${id}`)).status).toBe(204);
    expect((await call("GET", `/v1/customers/${id}`)).status).toBe(404);
  });
});

describe("quotes", () => {
  let customerId = "", quoteId = "";
  it("creates a quote from the default template with a yearly number", async () => {
    customerId = (await call("POST", "/v1/customers", { company: "Quote Co" })).body.id;
    const q = await call("POST", "/v1/quotes", { customerId, header: { title: "Pilot" } });
    expect(q.status).toBe(201);
    quoteId = q.body.id;
    expect(q.body.number).toMatch(new RegExp(`^Q-${new Date().getFullYear()}-\\d{4}$`));
    expect(Object.keys(q.body.draft.selections).sort()).toEqual(Object.keys(catalog.defaultPreset).sort());
    const q2 = await call("POST", "/v1/quotes", { customerId, template: "blank" });
    expect(q2.body.number).not.toBe(q.body.number);
    expect(q2.body.draft.selections).toEqual({});
  });
  it("validates drafts against the catalog", async () => {
    const draft = (await call("GET", `/v1/quotes/${quoteId}/draft`)).body;
    const bad = { ...draft, selections: { ...draft.selections, "NOPE": { on: true } } };
    expect((await call("PUT", `/v1/quotes/${quoteId}/draft`, bad)).status).toBe(422);
    const badUnit = await call("PUT", `/v1/quotes/${quoteId}/draft/selections/IN-OFFLOAD`, { on: true, units: { truck: { on: true } } });
    expect(badUnit.status).toBe(422);
  });
  it("selection put / delete and stale If-Match", async () => {
    const r = await call("GET", `/v1/quotes/${quoteId}`);
    const tag = r.headers.get("etag")!;
    const put = await call("PUT", `/v1/quotes/${quoteId}/draft/selections/OT-RUSH`, { on: true, price: 99 }, { "if-match": tag });
    expect(put.status).toBe(200);
    expect((await call("PUT", `/v1/quotes/${quoteId}/draft/selections/OT-RUSH`, { on: true, price: 98 }, { "if-match": tag })).status).toBe(412);
    expect((await call("GET", `/v1/quotes/${quoteId}/draft/selections/OT-RUSH`)).body.price).toBe(99);
    const lines = (await call("GET", `/v1/quotes/${quoteId}/rate-lines`)).body;
    expect(lines.find((l: { chargeId: string }) => l.chargeId === "OT-RUSH")).toMatchObject({ price: 99, mapping: { status: "mapped" } });
  });
  it("saves versions with the charge-code mapback, compares and restores", async () => {
    const v1 = await call("POST", `/v1/quotes/${quoteId}/versions`, { note: "first" });
    expect(v1.status).toBe(201);
    expect(v1.body.v).toBe(1);
    expect(v1.body.mapping.total).toBe(v1.body.mappingLines.length);
    await call("PUT", `/v1/quotes/${quoteId}/draft/selections/OT-RUSH`, { on: true, price: 120 });
    const d = (await call("GET", `/v1/quotes/${quoteId}/compare?from=1&to=draft`)).body;
    expect(d).toEqual([expect.objectContaining({ kind: "changed", from: 99, to: 120 })]);
    const v2 = await call("POST", `/v1/quotes/${quoteId}/versions`, { note: "second" });
    expect(v2.body.v).toBe(2);
    const restored = await call("POST", `/v1/quotes/${quoteId}/versions/1/restore`);
    expect(restored.body.selections["OT-RUSH"].price).toBe(99);
    const q = (await call("GET", `/v1/quotes/${quoteId}`)).body;
    expect(q.versions.map((v: { v: number }) => v.v)).toEqual([1, 2]);
    expect(q.draftChanged).toBe(true);
  });
  it("requireMapped refuses versions that need billing setup", async () => {
    await call("PUT", `/v1/quotes/${quoteId}/draft/selections/OT-PEAK`, { on: true });
    const r = await call("POST", `/v1/quotes/${quoteId}/versions?requireMapped=true`, {});
    expect(r.status).toBe(409);
    expect(r.body.setup.some((s: { kind: string; chargeId: string }) => s.kind === "new-item" && s.chargeId === "OT-PEAK")).toBe(true);
  });
  it("idempotent POST replays the first result", async () => {
    const a = await call("POST", `/v1/quotes/${quoteId}/versions`, { note: "retry" }, { "idempotency-key": "k-1" });
    const b = await call("POST", `/v1/quotes/${quoteId}/versions`, { note: "retry" }, { "idempotency-key": "k-1" });
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(b.body.v).toBe(a.body.v);
    expect((await call("GET", `/v1/quotes/${quoteId}/versions`)).body.length).toBe(a.body.v);
  });
  it("proposal and status changes; delete archives a quote with versions", async () => {
    const p = await call("GET", `/v1/quotes/${quoteId}/proposal?version=1`);
    expect(p.status).toBe(200);
    expect(p.body.sections.length).toBeGreaterThan(0);
    expect((await call("GET", `/v1/quotes/${quoteId}/proposal`, undefined, { accept: "application/pdf" })).status).toBe(406);
    expect((await call("PATCH", `/v1/quotes/${quoteId}`, { status: "sent" })).body.status).toBe("sent");
    expect((await call("DELETE", `/v1/quotes/${quoteId}`)).status).toBe(204);
    expect((await call("GET", `/v1/quotes/${quoteId}`)).body.status).toBe("archived");
    expect((await call("DELETE", `/v1/customers/${customerId}`)).status).toBe(409);
    const h = (await call("GET", `/v1/history?quoteId=${quoteId}`)).body.items.map((e: { type: string }) => e.type);
    expect(h).toEqual(expect.arrayContaining(["create", "save-version", "restore", "status"]));
  });
});

describe("standard template and catalog", () => {
  it("Q-STANDARD is seeded: existing charges mapped, new charges listed for billing setup", async () => {
    const list = (await call("GET", "/v1/quotes?q=Q-STANDARD")).body.items;
    expect(list).toHaveLength(1);
    const m = (await call("GET", `/v1/quotes/${list[0].id}/charge-code-mapping`)).body;
    expect(m.summary.total).toBeGreaterThan(80);
    expect(m.summary.newCondition).toBe(0);
    expect(m.summary.mapped + m.summary.newItem).toBe(m.summary.total);
    expect(m.setup.every((x: { kind: string; chargeId: string }) => x.kind === "new-item" && catalog.mapback.newItems[x.chargeId])).toBe(true);
  });
  it("catalog, charges, system codes, mapback rules and gaps", async () => {
    expect((await call("GET", "/v1/catalog")).body.version).toBe(catalog.version);
    expect((await call("GET", "/v1/catalog/charges/IN-OFFLOAD")).body.kind).toBe("builder");
    expect((await call("GET", "/v1/system-charge-codes/HANDLING-0129")).status).toBe(200);
    expect((await call("GET", "/v1/charge-code-maps?chargeId=IN-OFFLOAD")).body.length).toBeGreaterThan(0);
    expect(Array.isArray((await call("GET", "/v1/charge-code-gaps?kind=new-item")).body)).toBe(true);
    expect((await call("POST", "/v1/catalog/charges", {})).status).toBe(501);
  });
  it("bootstrap returns everything the editor needs", async () => {
    const b = (await call("GET", "/v1/app/bootstrap")).body;
    expect(b.user.email).toBe("sales@unisco.com");
    expect(b.customers.some((c: { code: string }) => c.code === "STANDARD")).toBe(true);
    expect(b.quotes.every((q: { draft: unknown; etag: string }) => q.draft && q.etag)).toBe(true);
  });
});

describe("webhooks and history", () => {
  it("rejects private / non-https URLs and hides the secret after create", async () => {
    expect((await call("POST", "/v1/webhooks", { url: "http://example.com/x", events: ["version.saved"] })).status).toBe(422);
    expect((await call("POST", "/v1/webhooks", { url: "https://127.0.0.1/x", events: ["version.saved"] })).status).toBe(422);
    const w = await call("POST", "/v1/webhooks", { url: "https://example.com/hook", events: ["version.saved"], active: false });
    expect(w.status).toBe(201);
    expect(w.body.secret).toBeTruthy();
    expect((await call("GET", `/v1/webhooks/${w.body.id}`)).body.secret).toBeUndefined();
  });
  it("client events: only view / export / print", async () => {
    expect((await call("POST", "/v1/history", { type: "export", detail: "xlsx" })).status).toBe(201);
    expect((await call("POST", "/v1/history", { type: "save-version" })).status).toBe(422);
  });
});

describe("contract", () => {
  it("every operation in the published OpenAPI spec is routed", async () => {
    const spec = (await import("../web/public/api/openapi.json")).default as { paths: Record<string, Record<string, unknown>> };
    const missing: string[] = [];
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const method of Object.keys(ops).filter(m => ["get", "post", "put", "patch", "delete"].includes(m))) {
        const url = path.replace(/\{version\}/g, "1").replace(/\{[^}]+\}/g, "zz-test-id");
        const r = await call(method.toUpperCase(), `/v1${url}`, ["post", "put", "patch"].includes(method) ? {} : undefined, {}, adminCookie);
        if (r.status === 404 && r.body?.detail?.startsWith(`${method.toUpperCase()} `)) missing.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
