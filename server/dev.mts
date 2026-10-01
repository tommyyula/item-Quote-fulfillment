// Local API server on :5182 (the Vite dev server proxies /api here).
// DATABASE_URL set -> that database (e.g. Neon after `vercel env pull`); otherwise a PGlite database under .data/.
import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { getDb, type Db } from "./db/client.ts";
import { ensureStandardTemplate } from "./db/seed.ts";
import { memoryDb } from "./testdb.ts";

process.env.AUTH_DEV_LOGIN ??= "1";
process.env.SESSION_SECRET ??= "local-development-session-secret-not-for-production";
let db: Db;
if (process.env.DATABASE_URL) db = getDb();
else {
  mkdirSync(".data", { recursive: true });
  db = await memoryDb(".data/pglite");
  console.log("PGlite database in .data/pglite");
}
console.log("standard template:", await ensureStandardTemplate(db));
serve({ fetch: createApp(db).fetch, port: 5182 }, i => console.log(`API on http://localhost:${i.port}/api`));
