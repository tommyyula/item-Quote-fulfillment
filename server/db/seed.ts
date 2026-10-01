// Seed data every installation needs: the "Standard Charge Template" customer and its quote Q-STANDARD
// (standard rates from all customers' price lists, saved as v1). Same rules as the browser-only app:
// create once; upgrade an untouched older template as a new version; never touch a template someone edited.
import { and, asc, eq } from "drizzle-orm";
import type { QuoteData } from "../../web/src/lib/types";
import { catalog, newQuoteData, snapshot } from "../domain";
import { newId, nowIso } from "../http";
import type { Db } from "./client";
import { customers, quotes, quoteVersions } from "./schema";

const SYSTEM = "system";
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export async function ensureStandardTemplate(db: Db): Promise<"created" | "upgraded" | "unchanged"> {
  const t = catalog.standardTemplate;
  const [cu] = await db.select().from(customers).where(eq(customers.code, t.customer.code));
  if (!cu) {
    const customerId = newId();
    await db.insert(customers).values({ id: customerId, code: t.customer.code, company: t.customer.company, channel: t.customer.channel, createdBy: SYSTEM });
    const data: QuoteData = newQuoteData("blank", { title: t.title, notes: t.note });
    data.selections = clone(t.selections);
    const quoteId = newId();
    await db.insert(quotes).values({ id: quoteId, number: "Q-STANDARD", customerId, draft: data, templateVersion: t.version, createdBy: SYSTEM, updatedBy: SYSTEM });
    const snap = snapshot(data);
    await db.insert(quoteVersions).values({ quoteId, v: 1, savedBy: SYSTEM, note: t.note, data, lineCount: snap.lineCount, mapping: snap.mapping });
    return "created";
  }
  const [q] = await db.select().from(quotes).where(and(eq(quotes.customerId, cu.id), eq(quotes.number, "Q-STANDARD")));
  if (!q || q.templateVersion === t.version) return "unchanged";
  const versions = await db.select().from(quoteVersions).where(eq(quoteVersions.quoteId, q.id)).orderBy(asc(quoteVersions.v));
  const last = versions.at(-1);
  if (!last || JSON.stringify(last.data) !== JSON.stringify(q.draft)) return "unchanged";   // edited: leave it alone
  const data = clone(last.data);
  data.selections = clone(t.selections);
  data.header.notes = t.note;
  const snap = snapshot(data);
  await db.insert(quoteVersions).values({ quoteId: q.id, v: last.v + 1, savedBy: SYSTEM, note: `${t.note} Updated template: ${t.version}.`,
    data, lineCount: snap.lineCount, mapping: snap.mapping });
  await db.update(quotes).set({ draft: data, templateVersion: t.version, updatedAt: nowIso(), rowVersion: q.rowVersion + 1 }).where(eq(quotes.id, q.id));
  return "upgraded";
}
