import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/client";
import { customers, quotes } from "../db/schema";
import { emit, logEvent } from "../events";
import { checkIfMatch, etag, invalid, jsonBody, newId, notFound, nowIso, paging, Problem, type Env } from "../http";

const FIELDS = ["code", "company", "contact", "phone", "email", "address", "city", "state", "zip", "channel"] as const;
type Input = Partial<Record<(typeof FIELDS)[number], string>>;
const CHANNELS = ["B2B", "D2C", "Both"];

function clean(body: Record<string, unknown>, partial: boolean): Input {
  const errors: { path: string; message: string }[] = [];
  const out: Input = {};
  for (const f of FIELDS) {
    const v = body[f];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") { errors.push({ path: f, message: "must be a string" }); continue; }
    out[f] = v.trim().slice(0, 500);
  }
  if (!partial && !out.company) errors.push({ path: "company", message: "required" });
  if (partial && out.company === "") errors.push({ path: "company", message: "cannot be empty" });
  if (out.channel && !CHANNELS.includes(out.channel)) errors.push({ path: "channel", message: `one of ${CHANNELS.join(", ")}` });
  if (out.email && !/^[^@\s]+@[^@\s]+$/.test(out.email)) errors.push({ path: "email", message: "not an e-mail address" });
  if (errors.length) throw invalid(errors);
  return out;
}

type Row = typeof customers.$inferSelect;
export const customerJson = ({ rowVersion: _rv, createdBy: _cb, ...c }: Row, quoteCount?: number) =>
  (quoteCount === undefined ? c : { ...c, quoteCount });

export function customerRoutes(db: Db) {
  const r = new Hono<Env>();
  const load = async (id: string) => {
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    if (!row) throw notFound("Customer");
    return row;
  };

  r.get("/", async c => {
    const { page, pageSize, offset } = paging(c);
    const where: SQL[] = [];
    const q = c.req.query("q")?.trim();
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`;
      where.push(or(ilike(customers.company, like), ilike(customers.contact, like), ilike(customers.code, like),
                    ilike(customers.email, like), ilike(customers.city, like))!);
    }
    if (c.req.query("channel")) where.push(eq(customers.channel, c.req.query("channel")!));
    const sort = c.req.query("sort") ?? "company";
    const order = { company: asc(customers.company), "-company": desc(customers.company), createdAt: asc(customers.createdAt),
                    "-createdAt": desc(customers.createdAt) }[sort] ?? asc(customers.company);
    const cond = where.length ? and(...where) : undefined;
    const quoteCount = sql<number>`(select count(*)::int from ${quotes} where ${quotes.customerId} = ${customers.id})`;
    const [rows, [{ total }]] = await Promise.all([
      db.select({ c: customers, quoteCount }).from(customers).where(cond).orderBy(order).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(customers).where(cond),
    ]);
    return c.json({ page, pageSize, total, items: rows.map(x => customerJson(x.c, x.quoteCount)) });
  });

  r.post("/", async c => {
    const body = await jsonBody(c);
    const input = clean(body, false);
    const p = c.get("principal");
    const [row] = await db.insert(customers).values({ id: newId(body.id), company: input.company!, ...input, createdBy: p.email })
      .onConflictDoNothing().returning();
    if (!row) throw new Problem(409, "Conflict", "A customer with this id already exists");
    await logEvent(db, p, "customer-create", { customerId: row.id, detail: row.company });
    emit(db, "customer.created", { customerId: row.id });
    c.header("ETag", etag(row.rowVersion));
    c.header("Location", `/api/v1/customers/${row.id}`);
    return c.json(customerJson(row), 201);
  });

  r.get("/:id", async c => {
    const row = await load(c.req.param("id"));
    c.header("ETag", etag(row.rowVersion));
    return c.json(customerJson(row));
  });

  const update = (partial: boolean) => async (c: import("hono").Context<Env>) => {
    const row = await load(c.req.param("id")!);
    checkIfMatch(c, row.rowVersion);
    const input = clean(await jsonBody(c), partial);
    const replaced = partial ? input : Object.fromEntries(FIELDS.map(f => [f, input[f] ?? (f === "channel" ? "Both" : "")]));
    const [next] = await db.update(customers).set({ ...replaced, updatedAt: nowIso(), rowVersion: row.rowVersion + 1 })
      .where(and(eq(customers.id, row.id), eq(customers.rowVersion, row.rowVersion))).returning();
    if (!next) throw new Problem(412, "Precondition failed", "The customer changed while saving; reload and retry.");
    await logEvent(db, c.get("principal"), "customer-edit", { customerId: next.id, detail: next.company });
    emit(db, "customer.updated", { customerId: next.id });
    c.header("ETag", etag(next.rowVersion));
    return c.json(customerJson(next));
  };
  r.put("/:id", update(false));
  r.patch("/:id", update(true));

  r.delete("/:id", async c => {
    const row = await load(c.req.param("id"));
    const [{ n }] = await db.select({ n: count() }).from(quotes).where(eq(quotes.customerId, row.id));
    if (n > 0) throw new Problem(409, "Conflict", `The customer has ${n} quote(s); archive or delete them first`);
    await db.delete(customers).where(eq(customers.id, row.id));
    return c.body(null, 204);
  });
  return r;
}
