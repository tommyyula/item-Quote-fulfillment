import { and, asc, count, desc, eq, gte, ilike, inArray, max, or, sql, type SQL } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { buildProposal } from "../../web/src/lib/proposal";
import type { ChargeSel, QuoteData } from "../../web/src/lib/types";
import type { Db } from "../db/client";
import { customers, quotes, quoteVersions } from "../db/schema";
import { catalog, diff, newQuoteData, rateLines, snapshot, validateData, validateSel } from "../domain";
import { emit, logEvent } from "../events";
import { checkIfMatch, etag, invalid, isUniqueViolation, jsonBody, newId, notFound, nowIso, paging, Problem, type Env } from "../http";
import { customerJson } from "./customers";

const STATUSES = ["draft", "sent", "accepted", "archived"];
type QuoteRow = typeof quotes.$inferSelect;
type VersionRow = typeof quoteVersions.$inferSelect;

const versionSummary = (v: VersionRow) => ({
  v: v.v, savedAt: v.savedAt, savedBy: v.savedBy ?? undefined, note: v.note, lineCount: v.lineCount, mapping: v.mapping?.summary,
});
const versionJson = (v: VersionRow) => {
  const lines = v.mapping?.lines ?? [];
  return { ...versionSummary(v), data: v.data, mappingLines: lines, setup: snapshot(v.data).setup };
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function quoteSummary(q: QuoteRow, last: VersionRow | undefined) {
  return {
    id: q.id, number: q.number, customerId: q.customerId, title: q.draft.header?.title ?? "", status: q.status,
    createdAt: q.createdAt, updatedAt: q.updatedAt, latestVersion: last?.v ?? null,
    draftChanged: !last || !same(last.data, q.draft), templateVersion: q.templateVersion ?? undefined,
  };
}
export const quoteJson = (q: QuoteRow, versions: VersionRow[]) =>
  ({ ...quoteSummary(q, versions.at(-1)), draft: q.draft, versions: versions.map(versionSummary) });

/** Next number for the year: Q-2026-0001, Q-2026-0002, ... (the unique index settles races; callers retry). */
async function nextNumber(db: Db) {
  const y = new Date().getFullYear();
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(split_part(${quotes.number}, '-', 3)::int), 0)` })
    .from(quotes).where(sql`${quotes.number} ~ ${`^Q-${y}-[0-9]+$`}`);
  return `Q-${y}-${String(Number(n) + 1).padStart(4, "0")}`;
}

export function quoteRoutes(db: Db) {
  const r = new Hono<Env>();

  const load = async (id: string) => {
    const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!row) throw notFound("Quote");
    return row;
  };
  const versionsOf = (id: string) => db.select().from(quoteVersions).where(eq(quoteVersions.quoteId, id)).orderBy(asc(quoteVersions.v));
  const loadVersion = async (id: string, v: number) => {
    const [row] = await db.select().from(quoteVersions).where(and(eq(quoteVersions.quoteId, id), eq(quoteVersions.v, v)));
    if (!row) throw notFound(`Version ${v}`);
    return row;
  };
  /** The draft, or a saved version when ?version= is given. */
  const dataAt = async (c: Context<Env>, q: QuoteRow): Promise<{ data: QuoteData; label: string }> => {
    const v = c.req.query("version");
    if (!v) return { data: q.draft, label: "Draft" };
    return { data: (await loadVersion(q.id, parseInt(v))).data, label: `v${v}` };
  };
  /** Optimistic write of the draft and/or status; bumps row_version so concurrent editors get 412 instead of losing work. */
  const write = async (c: Context<Env>, q: QuoteRow, set: Partial<Pick<QuoteRow, "draft" | "status">>) => {
    const [next] = await db.update(quotes)
      .set({ ...set, updatedAt: nowIso(), updatedBy: c.get("principal").email, rowVersion: q.rowVersion + 1 })
      .where(and(eq(quotes.id, q.id), eq(quotes.rowVersion, q.rowVersion))).returning();
    if (!next) throw new Problem(412, "Precondition failed", "The quote changed while saving; reload and retry.");
    c.header("ETag", etag(next.rowVersion));
    return next;
  };

  // ------------------------------------------------------------------ quotes
  r.get("/", async c => {
    const { page, pageSize, offset } = paging(c);
    const where: SQL[] = [];
    if (c.req.query("customerId")) where.push(eq(quotes.customerId, c.req.query("customerId")!));
    if (c.req.query("status")) where.push(eq(quotes.status, c.req.query("status")!));
    if (c.req.query("updatedSince")) where.push(gte(quotes.updatedAt, c.req.query("updatedSince")!));
    const q = c.req.query("q")?.trim();
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`;
      where.push(or(ilike(quotes.number, like), sql`${quotes.draft}->'header'->>'title' ilike ${like}`)!);
    }
    const cond = where.length ? and(...where) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(quotes).where(cond).orderBy(desc(quotes.updatedAt)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(quotes).where(cond),
    ]);
    const ids = rows.map(x => x.id);
    const latest = ids.length
      ? await db.select().from(quoteVersions).where(and(inArray(quoteVersions.quoteId, ids),
          sql`${quoteVersions.v} = (select max(v2.v) from ${quoteVersions} v2 where v2.quote_id = ${quoteVersions.quoteId})`))
      : [];
    const byQuote = new Map(latest.map(v => [v.quoteId, v]));
    return c.json({ page, pageSize, total, items: rows.map(x => quoteSummary(x, byQuote.get(x.id))) });
  });

  r.post("/", async c => {
    const body = await jsonBody<{ id?: string; customerId?: string; template?: "default" | "blank"; header?: Partial<QuoteData["header"]> }>(c);
    if (!body.customerId) throw invalid([{ path: "customerId", message: "required" }]);
    if (body.template && !["default", "blank"].includes(body.template)) throw invalid([{ path: "template", message: "default or blank" }]);
    const [cu] = await db.select().from(customers).where(eq(customers.id, body.customerId));
    if (!cu) throw notFound("Customer");
    const p = c.get("principal");
    const draft = newQuoteData(body.template ?? "default", body.header ?? {});
    const id = newId(body.id);
    for (let attempt = 0; ; attempt++) {
      try {
        const [row] = await db.insert(quotes).values({ id, number: await nextNumber(db), customerId: cu.id, draft, createdBy: p.email, updatedBy: p.email }).returning();
        await logEvent(db, p, "create", { quoteId: row.id, customerId: cu.id });
        emit(db, "quote.created", { quoteId: row.id, customerId: cu.id });
        c.header("ETag", etag(row.rowVersion));
        c.header("Location", `/api/v1/quotes/${row.id}`);
        return c.json(quoteJson(row, []), 201);
      } catch (e) {
        if (!isUniqueViolation(e) || attempt >= 5) throw e;
        const [dupe] = await db.select().from(quotes).where(eq(quotes.id, id));
        if (dupe) throw new Problem(409, "Conflict", "A quote with this id already exists");
      }
    }
  });

  r.get("/:id", async c => {
    const q = await load(c.req.param("id"));
    c.header("ETag", etag(q.rowVersion));
    return c.json(quoteJson(q, await versionsOf(q.id)));
  });

  r.patch("/:id", async c => {
    const q = await load(c.req.param("id"));
    checkIfMatch(c, q.rowVersion);
    const body = await jsonBody<{ status?: string; header?: Partial<QuoteData["header"]> }>(c);
    if (body.status !== undefined && !STATUSES.includes(body.status)) throw invalid([{ path: "status", message: STATUSES.join(", ") }]);
    const set: Partial<QuoteRow> = {};
    if (body.status !== undefined) set.status = body.status;
    if (body.header) set.draft = { ...q.draft, header: { ...q.draft.header, ...body.header } };
    const next = await write(c, q, set);
    const p = c.get("principal");
    if (body.status !== undefined && body.status !== q.status) {
      await logEvent(db, p, "status", { quoteId: q.id, customerId: q.customerId, detail: body.status });
      emit(db, "quote.status_changed", { quoteId: q.id, customerId: q.customerId, status: body.status });
    }
    if (body.header) emit(db, "quote.updated", { quoteId: q.id, customerId: q.customerId });
    return c.json(quoteJson(next, await versionsOf(q.id)));
  });

  r.delete("/:id", async c => {
    const q = await load(c.req.param("id"));
    const [{ n }] = await db.select({ n: count() }).from(quoteVersions).where(eq(quoteVersions.quoteId, q.id));
    if (n > 0) {
      if (q.status !== "archived") await write(c, q, { status: "archived" });
    } else {
      await db.delete(quotes).where(eq(quotes.id, q.id));
    }
    return c.body(null, 204);
  });

  // ------------------------------------------------------------------ draft
  r.get("/:id/draft", async c => {
    const q = await load(c.req.param("id"));
    c.header("ETag", etag(q.rowVersion));
    return c.json(q.draft);
  });

  r.put("/:id/draft", async c => {
    const q = await load(c.req.param("id"));
    checkIfMatch(c, q.rowVersion);
    const template = c.req.query("template");
    let draft: QuoteData;
    if (template === "default" || template === "blank") {
      draft = { header: q.draft.header, selections: newQuoteData(template).selections };
    } else {
      draft = await jsonBody<QuoteData>(c);
      const errors = validateData(draft);
      if (errors.length) throw invalid(errors);
    }
    const next = await write(c, q, { draft });
    emit(db, "quote.updated", { quoteId: q.id, customerId: q.customerId });
    return c.json(next.draft);
  });

  r.get("/:id/draft/selections", async c => {
    const q = await load(c.req.param("id"));
    const onlyOn = c.req.query("onlyOn") !== "false";
    return c.json(Object.fromEntries(Object.entries(q.draft.selections).filter(([, s]) => !onlyOn || s.on)));
  });
  r.get("/:id/draft/selections/:chargeId", async c => {
    const q = await load(c.req.param("id"));
    const s = q.draft.selections[c.req.param("chargeId")];
    if (!s) throw notFound("Selection");
    return c.json(s);
  });
  r.put("/:id/draft/selections/:chargeId", async c => {
    const q = await load(c.req.param("id"));
    checkIfMatch(c, q.rowVersion);
    const chargeId = c.req.param("chargeId");
    const s = await jsonBody<ChargeSel>(c);
    const empty = { conds: {}, units: {}, prices: {}, settings: {} };
    const sel: ChargeSel = { ...empty, ...s };
    const errors = validateSel(chargeId, sel);
    if (errors.length) throw invalid(errors);
    await write(c, q, { draft: { ...q.draft, selections: { ...q.draft.selections, [chargeId]: sel } } });
    emit(db, "quote.updated", { quoteId: q.id, customerId: q.customerId });
    return c.json(sel);
  });
  r.delete("/:id/draft/selections/:chargeId", async c => {
    const q = await load(c.req.param("id"));
    checkIfMatch(c, q.rowVersion);
    const chargeId = c.req.param("chargeId");
    if (!q.draft.selections[chargeId]) throw notFound("Selection");
    const { [chargeId]: _gone, ...rest } = q.draft.selections;
    await write(c, q, { draft: { ...q.draft, selections: rest } });
    emit(db, "quote.updated", { quoteId: q.id, customerId: q.customerId });
    return c.body(null, 204);
  });

  // ------------------------------------------------------------------ versions
  r.get("/:id/versions", async c => {
    const q = await load(c.req.param("id"));
    return c.json((await versionsOf(q.id)).map(versionSummary));
  });

  r.post("/:id/versions", async c => {
    const q = await load(c.req.param("id"));
    const body = c.req.header("content-type") ? await jsonBody<{ note?: string }>(c) : {};
    const note = String(body.note ?? "").slice(0, 2000);
    const snap = snapshot(q.draft);
    if (c.req.query("requireMapped") === "true" && snap.setup.length)
      throw new Problem(409, "Setup required", "Some rate lines need billing-system setup first", { setup: snap.setup });
    const p = c.get("principal");
    for (let attempt = 0; ; attempt++) {
      const [{ v }] = await db.select({ v: max(quoteVersions.v) }).from(quoteVersions).where(eq(quoteVersions.quoteId, q.id));
      try {
        const [row] = await db.insert(quoteVersions).values({ quoteId: q.id, v: (v ?? 0) + 1, savedBy: p.email, note, data: q.draft,
          lineCount: snap.lineCount, mapping: snap.mapping }).returning();
        await logEvent(db, p, "save-version", { quoteId: q.id, customerId: q.customerId,
          detail: `v${row.v} (${snap.mapping.summary.mapped}/${snap.mapping.summary.total})` });
        emit(db, "version.saved", { quoteId: q.id, customerId: q.customerId, version: row.v, mapping: snap.mapping.summary, setup: snap.setup });
        return c.json({ ...versionJson(row), setup: snap.setup }, 201);
      } catch (e) {
        if (!isUniqueViolation(e) || attempt >= 5) throw e;
      }
    }
  });

  r.get("/:id/versions/:v{[0-9]+}", async c => {
    const q = await load(c.req.param("id"));
    return c.json(versionJson(await loadVersion(q.id, parseInt(c.req.param("v")))));
  });

  r.post("/:id/versions/:v{[0-9]+}/restore", async c => {
    const q = await load(c.req.param("id"));
    const ver = await loadVersion(q.id, parseInt(c.req.param("v")));
    const next = await write(c, q, { draft: ver.data });
    await logEvent(db, c.get("principal"), "restore", { quoteId: q.id, customerId: q.customerId, detail: `v${ver.v}` });
    emit(db, "quote.updated", { quoteId: q.id, customerId: q.customerId });
    return c.json(next.draft);
  });

  r.get("/:id/compare", async c => {
    const q = await load(c.req.param("id"));
    const at = async (x: string | undefined) => {
      if (!x) throw invalid([{ path: "from/to", message: "required (version number or draft)" }]);
      if (x === "draft") return q.draft;
      if (!/^\d+$/.test(x)) throw invalid([{ path: "from/to", message: "version number or draft" }]);
      return (await loadVersion(q.id, parseInt(x))).data;
    };
    return c.json(diff(await at(c.req.query("from")), await at(c.req.query("to"))));
  });

  // ------------------------------------------------------------------ computed
  r.get("/:id/rate-lines", async c => {
    const q = await load(c.req.param("id"));
    return c.json(rateLines((await dataAt(c, q)).data));
  });

  r.get("/:id/charge-code-mapping", async c => {
    const q = await load(c.req.param("id"));
    const snap = snapshot((await dataAt(c, q)).data);
    return c.json({ summary: snap.mapping.summary, lines: snap.mapping.lines, setup: snap.setup });
  });

  r.get("/:id/proposal", async c => {
    const accept = c.req.header("accept") ?? "application/json";
    if (!/application\/json|\*\/\*/.test(accept))
      throw new Problem(406, "Not acceptable", "Only application/json is served by the API today; PDF and Excel are exported from the web app.");
    const q = await load(c.req.param("id"));
    const { data, label } = await dataAt(c, q);
    const [cu] = await db.select().from(customers).where(eq(customers.id, q.customerId));
    const valid = new Date(`${data.header.effectiveDate || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    valid.setUTCDate(valid.getUTCDate() + (data.header.validDays || 90));
    return c.json({ quoteNumber: q.number, version: label, lang: "en", header: data.header, customer: cu ? customerJson(cu) : null,
                    validUntil: valid.toISOString().slice(0, 10), sections: buildProposal(catalog, data).filter(s => s.rows.length) });
  });

  return r;
}
