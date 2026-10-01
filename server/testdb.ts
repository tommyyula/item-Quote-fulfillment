// In-memory Postgres (PGlite) with the real migrations, for tests and offline development.
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./db/client";
import * as schema from "./db/schema";

/** Run from the repository root (npm scripts do). */
export async function memoryDb(dataDir?: string): Promise<Db> {
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: resolve("server/db/migrations") });
  return db as unknown as Db;
}
