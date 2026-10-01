// The API application. Mounted at /api: /api/auth/* (sign-in) and /api/v1/* (the OpenAPI contract, web/public/api/openapi.yaml).
import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { authRoutes, requireAuth } from "./auth";
import type { Db } from "./db/client";
import { customers, history, idempotency, quotes, quoteVersions } from "./db/schema";
import { catalog } from "./domain";
import { Problem, type Env } from "./http";
import { catalogRoutes } from "./routes/catalog";
import { customerJson, customerRoutes } from "./routes/customers";
import { adminRoutes, historyRoutes, webhookRoutes } from "./routes/misc";
import { quoteSummary } from "./routes/quotes";
import { quoteRoutes } from "./routes/quotes";

export function createApp(db: Db) {
  const app = new Hono<Env>().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof Problem) return err.getResponse();
    console.error(err);
    return c.json({ type: "about:blank", title: "Internal server error", status: 500 }, 500, { "content-type": "application/problem+json" });
  });
  app.notFound(c => c.json({ type: "about:blank", title: "Not found", status: 404, detail: `${c.req.method} ${c.req.path}` }, 404,
                             { "content-type": "application/problem+json" }));
  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
    c.header("X-Content-Type-Options", "nosniff");
  });

  app.get("/health", c => c.json({ ok: true, catalog: catalog.version }));
  app.route("/auth", authRoutes(db));

  const v1 = new Hono<Env>();
  v1.use("*", requireAuth(db));

  // Idempotency-Key on POST: a retried request returns the stored first result
  v1.use("*", async (c, next) => {
    const key = c.req.method === "POST" ? c.req.header("idempotency-key") : undefined;
    if (!key) return next();
    if (key.length > 128) throw new Problem(400, "Bad request", "Idempotency-Key is too long");
    const principal = c.get("principal").id;
    const [hit] = await db.select().from(idempotency).where(and(eq(idempotency.principal, principal), eq(idempotency.key, key)));
    if (hit) {
      if (hit.path !== c.req.path) throw new Problem(422, "Idempotency-Key reused", "The key was used for a different request");
      return c.json(hit.body ?? null, hit.status as 200, { "Idempotent-Replayed": "true" });
    }
    await next();
    if (c.res.status < 500 && (c.res.headers.get("content-type") ?? "").includes("json")) {
      const body = await c.res.clone().json().catch(() => null);
      await db.insert(idempotency).values({ key, principal, path: c.req.path, status: c.res.status, body }).onConflictDoNothing();
    }
  });

  v1.route("/customers", customerRoutes(db));
  v1.route("/quotes", quoteRoutes(db));
  v1.route("/history", historyRoutes(db));
  v1.route("/webhooks", webhookRoutes(db));
  v1.route("/admin", adminRoutes(db));
  v1.route("/", catalogRoutes());

  /** Web app start-up: everything the editor shows, in one round trip (versions without the per-line mapback). */
  v1.get("/app/bootstrap", async c => {
    const [cs, qs, vs, hs] = await Promise.all([
      db.select().from(customers).orderBy(asc(customers.company)),
      db.select().from(quotes).orderBy(desc(quotes.updatedAt)),
      db.select({ quoteId: quoteVersions.quoteId, v: quoteVersions.v, savedAt: quoteVersions.savedAt, savedBy: quoteVersions.savedBy,
                  note: quoteVersions.note, data: quoteVersions.data, lineCount: quoteVersions.lineCount, mapping: quoteVersions.mapping })
        .from(quoteVersions).orderBy(asc(quoteVersions.v)),
      db.select().from(history).orderBy(desc(history.ts)).limit(300),
    ]);
    const byQuote = new Map<string, typeof vs>();
    for (const v of vs) (byQuote.get(v.quoteId) ?? byQuote.set(v.quoteId, []).get(v.quoteId)!).push(v);
    return c.json({
      user: c.get("principal"),
      customers: cs.map(x => customerJson(x)),
      quotes: qs.map(q => {
        const versions = byQuote.get(q.id) ?? [];
        return { ...quoteSummary(q, undefined), etag: `W/"${q.rowVersion}"`, draft: q.draft,
                 versions: versions.map(v => ({ v: v.v, savedAt: v.savedAt, savedBy: v.savedBy, note: v.note, data: v.data, lineCount: v.lineCount,
                                                mapping: v.mapping ? { summary: v.mapping.summary, lines: [] } : undefined })) };
      }),
      history: hs,
    });
  });

  app.route("/v1", v1);
  return app;
}
