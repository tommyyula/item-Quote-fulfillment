// Vercel Function entry (bundled by scripts/build-vercel.mjs): every /api/(v1|auth|health|public)* request is served by the Hono app.
import { getRequestListener } from "@hono/node-server";
import { createApp } from "./app";
import { getDb } from "./db/client";

let app: ReturnType<typeof createApp> | null = null;
export default getRequestListener(req => (app ??= createApp(getDb())).fetch(req));
