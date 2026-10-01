// History (append-only), webhooks, and admin-only API key management.
import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, isNull, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { generateApiKey, requireAdmin } from "../auth";
import type { Db } from "../db/client";
import { apiKeys, history, webhooks } from "../db/schema";
import { logEvent, WEBHOOK_EVENTS, type HistoryType } from "../events";
import { invalid, jsonBody, newId, notFound, nowIso, paging, type Env } from "../http";

export function historyRoutes(db: Db) {
  const r = new Hono<Env>();
  r.get("/", async c => {
    const { page, pageSize, offset } = paging(c);
    const where: SQL[] = [];
    const { quoteId, customerId, type, since } = c.req.query();
    if (quoteId) where.push(eq(history.quoteId, quoteId));
    if (customerId) where.push(eq(history.customerId, customerId));
    if (type) where.push(eq(history.type, type));
    if (since) where.push(gte(history.ts, since));
    const cond = where.length ? and(...where) : undefined;
    const [items, [{ total }]] = await Promise.all([
      db.select().from(history).where(cond).orderBy(desc(history.ts)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(history).where(cond),
    ]);
    return c.json({ page, pageSize, total, items });
  });
  r.get("/:id", async c => {
    const [row] = await db.select().from(history).where(eq(history.id, c.req.param("id")));
    if (!row) throw notFound("Event");
    return c.json(row);
  });
  /** Client-side events the server cannot see (view, export, print). Server actions log themselves. */
  r.post("/", async c => {
    const b = await jsonBody<{ id?: string; type?: string; quoteId?: string; customerId?: string; detail?: string }>(c);
    if (!["view", "export", "print"].includes(b.type ?? ""))
      throw invalid([{ path: "type", message: "view, export or print (other events are recorded by the server)" }]);
    const row = await logEvent(db, c.get("principal"), b.type as HistoryType, { id: b.id, quoteId: b.quoteId, customerId: b.customerId,
                                                                               detail: b.detail?.slice(0, 500) });
    return c.json(row, 201);
  });
  return r;
}

function checkWebhook(b: { url?: string; events?: string[]; active?: boolean; description?: string }) {
  const errors: { path: string; message: string }[] = [];
  let url: URL | null = null;
  try {
    url = new URL(b.url ?? "");
  } catch {
    errors.push({ path: "url", message: "absolute URL required" });
  }
  if (url && url.protocol !== "https:") errors.push({ path: "url", message: "https required" });
  if (url && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|0\.)/.test(url.hostname))
    errors.push({ path: "url", message: "private or local addresses are not allowed" });
  if (!Array.isArray(b.events) || !b.events.length) errors.push({ path: "events", message: "at least one event" });
  else for (const e of b.events) if (!(WEBHOOK_EVENTS as readonly string[]).includes(e)) errors.push({ path: "events", message: `unknown event ${e}` });
  if (errors.length) throw invalid(errors);
  return { url: url!.toString(), events: b.events!, active: b.active ?? true, description: String(b.description ?? "").slice(0, 500) };
}
const hookJson = ({ secret: _s, ...w }: typeof webhooks.$inferSelect) => w;

export function webhookRoutes(db: Db) {
  const r = new Hono<Env>();
  const load = async (id: string) => {
    const [w] = await db.select().from(webhooks).where(eq(webhooks.id, id));
    if (!w) throw notFound("Webhook");
    return w;
  };
  r.get("/", async c => c.json((await db.select().from(webhooks).orderBy(desc(webhooks.createdAt))).map(hookJson)));
  r.post("/", async c => {
    const input = checkWebhook(await jsonBody(c));
    const secret = randomBytes(24).toString("base64url");
    const [w] = await db.insert(webhooks).values({ id: newId(), ...input, secret, createdBy: c.get("principal").email }).returning();
    return c.json({ ...hookJson(w), secret }, 201);   // the secret is returned this once
  });
  r.get("/:id", async c => c.json(hookJson(await load(c.req.param("id")))));
  r.put("/:id", async c => {
    const w = await load(c.req.param("id"));
    const [next] = await db.update(webhooks).set(checkWebhook(await jsonBody(c))).where(eq(webhooks.id, w.id)).returning();
    return c.json(hookJson(next));
  });
  r.delete("/:id", async c => {
    await load(c.req.param("id"));
    await db.delete(webhooks).where(eq(webhooks.id, c.req.param("id")));
    return c.body(null, 204);
  });
  return r;
}

export function adminRoutes(db: Db) {
  const r = new Hono<Env>();
  r.use("*", requireAdmin);
  r.get("/api-keys", async c => c.json(await db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdBy: apiKeys.createdBy,
    createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt }).from(apiKeys).orderBy(desc(apiKeys.createdAt))));
  r.post("/api-keys", async c => {
    const { name } = await jsonBody<{ name?: string }>(c);
    if (!name?.trim()) throw invalid([{ path: "name", message: "required (which system uses the key)" }]);
    const { key, prefix, hash } = generateApiKey();
    const [row] = await db.insert(apiKeys).values({ id: newId(), name: name.trim().slice(0, 100), prefix, hash, createdBy: c.get("principal").email }).returning();
    return c.json({ id: row.id, name: row.name, prefix, key }, 201);   // the key is shown once
  });
  r.delete("/api-keys/:id", async c => {
    const [row] = await db.update(apiKeys).set({ revokedAt: nowIso() }).where(and(eq(apiKeys.id, c.req.param("id")), isNull(apiKeys.revokedAt))).returning();
    if (!row) throw notFound("Active API key");
    return c.body(null, 204);
  });
  return r;
}
