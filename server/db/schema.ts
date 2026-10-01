// Postgres schema. Quote drafts and version snapshots are stored as JSON documents (the same QuoteData the web app edits),
// so the pricing engine and charge-code mapback run unchanged on both sides.
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { QuoteData, VersionMapping } from "../../web/src/lib/types";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const created = () => ts("created_at").notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("user"),        // user | admin
  createdAt: created(),
  lastLoginAt: ts("last_login_at"),
}, t => [uniqueIndex("users_email").on(t.email)]);

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  code: text("code").notNull().default(""),
  company: text("company").notNull(),
  contact: text("contact").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  zip: text("zip").notNull().default(""),
  channel: text("channel").notNull().default("Both"),
  createdAt: created(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  rowVersion: integer("row_version").notNull().default(1),
  createdBy: text("created_by"),
}, t => [index("customers_company").on(t.company)]);

export const quotes = pgTable("quotes", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  status: text("status").notNull().default("draft"),
  draft: jsonb("draft").$type<QuoteData>().notNull(),
  templateVersion: text("template_version"),
  createdAt: created(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  rowVersion: integer("row_version").notNull().default(1),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, t => [uniqueIndex("quotes_number").on(t.number), index("quotes_customer").on(t.customerId)]);

export const quoteVersions = pgTable("quote_versions", {
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  v: integer("v").notNull(),
  savedAt: ts("saved_at").notNull().defaultNow(),
  savedBy: text("saved_by"),
  note: text("note").notNull().default(""),
  data: jsonb("data").$type<QuoteData>().notNull(),
  lineCount: integer("line_count").notNull(),
  mapping: jsonb("mapping").$type<VersionMapping>(),
}, t => [primaryKey({ columns: [t.quoteId, t.v] })]);

export const history = pgTable("history", {
  id: text("id").primaryKey(),
  ts: ts("ts").notNull().defaultNow(),
  type: text("type").notNull(),
  quoteId: text("quote_id"),
  customerId: text("customer_id"),
  user: text("user_email"),
  detail: text("detail"),
}, t => [index("history_ts").on(t.ts), index("history_quote").on(t.quoteId)]);

/** System-to-system keys. Only a SHA-256 hash is stored; the key itself is shown once on creation. */
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  hash: text("hash").notNull(),
  createdBy: text("created_by"),
  createdAt: created(),
  lastUsedAt: ts("last_used_at"),
  revokedAt: ts("revoked_at"),
}, t => [uniqueIndex("api_keys_hash").on(t.hash)]);

export const webhooks = pgTable("webhooks", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull(),
  active: boolean("active").notNull().default(true),
  description: text("description").notNull().default(""),
  secret: text("secret").notNull(),
  createdAt: created(),
  createdBy: text("created_by"),
  lastDeliveryAt: ts("last_delivery_at"),
  lastStatus: integer("last_status"),
});

/** Idempotency-Key replay store for POST requests (per principal). */
export const idempotency = pgTable("idempotency", {
  key: text("key").notNull(),
  principal: text("principal").notNull(),
  path: text("path").notNull(),
  status: integer("status").notNull(),
  body: jsonb("body"),
  createdAt: created(),
}, t => [primaryKey({ columns: [t.principal, t.key] })]);
