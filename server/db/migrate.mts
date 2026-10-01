// Apply migrations + seed to the database in DATABASE_URL (run: `npm run db:migrate` after `vercel env pull`).
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDb } from "./client.ts";
import { ensureStandardTemplate } from "./seed.ts";

const folder = fileURLToPath(new URL("./migrations", import.meta.url));
const db = getDb();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await migrate(db as any, { migrationsFolder: folder });
console.log("migrations applied");
console.log("standard template:", await ensureStandardTemplate(db));
