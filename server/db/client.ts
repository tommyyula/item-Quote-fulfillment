// Database handle. Production: Neon over HTTP (serverless-friendly, no pool to manage).
// Tests and offline development: PGlite (Postgres compiled to WASM, in memory) with the same schema and migrations.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

let _db: Db | null = null;
/** Lazily created so importing the app never needs DATABASE_URL (builds, tests). */
export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _db = drizzle(neon(url), { schema }) as unknown as Db;
  }
  return _db;
}

