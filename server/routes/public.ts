// Public, no sign-in: the guided quote on /start. A visitor's answers become a customer + draft quote at standard rates,
// which sales then follow up in the app. The quote is built on the server from validated answers, never from client selections.
import { createHash } from "node:crypto";
import { and, count, eq, gte, like } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { cleanAnswers, wizardSelections, type WizardAnswers } from "../../web/src/lib/wizard";
import type { Db } from "../db/client";
import { customers, history, quotes } from "../db/schema";
import { catalog, newQuoteData } from "../domain";
import { emit, logEvent } from "../events";
import { invalid, isUniqueViolation, jsonBody, newId, Problem, type Env, type Principal } from "../http";
import { customerJson } from "./customers";
import { nextNumber } from "./quotes";

export const PUBLIC_PRINCIPAL: Principal = { kind: "user", id: "public", email: "public-wizard", name: "Public guided quote", role: "public" };
const PER_IP_PER_HOUR = 5;
const PER_DAY = 300;

const clientIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0].trim() || c.req.header("x-real-ip") || "unknown";
const ipTag = (ip: string) => `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 12)}`;

/** What the visitor told us, for the sales person picking the request up. */
function notesFor(a: WizardAnswers) {
  const list = (xs: string[]) => xs.join(", ") || "-";
  return [
    `Request from the public guided quote. Contact: ${[a.contact, a.email, a.phone].filter(Boolean).join(", ")}.`,
    `Sells: ${a.channel}. Temperature: ${a.temperature}. Arrives: ${list(a.arrival)}. Storage: ${list(a.storage)}.`,
    a.channel !== "D2C" ? `B2B shipping: ${list(a.b2bShip)}. Retailers: ${list(a.retailers)}.` : "",
    a.channel !== "B2B" ? `Online stores: ${list(a.platforms)}.` : "",
    `Picking: ${list(a.pick)}. Returns: ${a.returns ? "yes" : "no"}. Extras: ${list(a.extras)}.`,
  ].filter(Boolean).join(" ");
}

export function publicRoutes(db: Db) {
  const r = new Hono<Env>();

  r.post("/quote-requests", async c => {
    const body = await jsonBody<{ answers?: unknown }>(c);
    const { answers: a, errors } = cleanAnswers(catalog, body.answers);
    if (errors.length) throw invalid(errors);

    // abuse limits, kept in the history table (no extra infrastructure): per visitor per hour, and overall per day
    const tag = ipTag(clientIp(c));
    const hourAgo = new Date(Date.now() - 3600_000).toISOString(), dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const mine = and(eq(history.user, PUBLIC_PRINCIPAL.email), eq(history.type, "customer-create"));
    const [[{ n: perIp }], [{ n: perDay }]] = await Promise.all([
      db.select({ n: count() }).from(history).where(and(mine, gte(history.ts, hourAgo), like(history.detail, `%${tag}%`))),
      db.select({ n: count() }).from(history).where(and(mine, gte(history.ts, dayAgo))),
    ]);
    if (perIp >= PER_IP_PER_HOUR || perDay >= PER_DAY)
      throw new Problem(429, "Too many requests", "Too many quote requests; please try again later.");

    const [cu] = await db.insert(customers).values({
      id: newId(), company: a.company, contact: a.contact, email: a.email, phone: a.phone, channel: a.channel,
      createdBy: PUBLIC_PRINCIPAL.email,
    }).returning();
    await logEvent(db, PUBLIC_PRINCIPAL, "customer-create", { customerId: cu.id, detail: `${cu.company} (public request, ${tag})` });
    emit(db, "customer.created", { customerId: cu.id });

    const draft = newQuoteData("blank", { title: `Warehousing for ${a.company}`, facility: a.facility, notes: notesFor(a) });
    draft.selections = wizardSelections(a);
    const id = newId();
    for (let attempt = 0; ; attempt++) {
      try {
        const [q] = await db.insert(quotes).values({ id, number: await nextNumber(db), customerId: cu.id, draft,
                                                     createdBy: PUBLIC_PRINCIPAL.email, updatedBy: PUBLIC_PRINCIPAL.email }).returning();
        await logEvent(db, PUBLIC_PRINCIPAL, "create", { quoteId: q.id, customerId: cu.id, detail: "public request" });
        emit(db, "quote.created", { quoteId: q.id, customerId: cu.id });
        return c.json({ number: q.number, customer: customerJson(cu), draft: q.draft }, 201);
      } catch (e) {
        if (!isUniqueViolation(e) || attempt >= 5) throw e;
      }
    }
  });
  return r;
}
