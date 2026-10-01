// Activity history (append-only) and webhook delivery.
import { createHmac, randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { history, webhooks } from "./db/schema";
import { nowIso, type Principal } from "./http";

export const HISTORY_TYPES = ["view", "create", "save-version", "restore", "export", "print", "customer-create", "customer-edit", "status"] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];
export const WEBHOOK_EVENTS = ["quote.created", "quote.updated", "quote.status_changed", "version.saved", "customer.created", "customer.updated"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export async function logEvent(db: Db, p: Principal, type: HistoryType, e: { quoteId?: string | null; customerId?: string | null; detail?: string; id?: string }) {
  const row = { id: e.id && /^[A-Za-z0-9_-]{6,64}$/.test(e.id) ? e.id : randomUUID(), ts: nowIso(), type, quoteId: e.quoteId ?? null,
                customerId: e.customerId ?? null, user: p.email, detail: e.detail ?? null };
  await db.insert(history).values(row).onConflictDoNothing();
  return row;
}

export const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** Fire matching webhooks after the response is sent (one attempt, 5 s timeout; last status kept on the subscription). */
export function emit(db: Db, type: WebhookEventType, data: Record<string, unknown>) {
  const work = (async () => {
    const subs = (await db.select().from(webhooks).where(eq(webhooks.active, true))).filter(w => w.events.includes(type));
    await Promise.all(subs.map(async w => {
      const body = JSON.stringify({ id: randomUUID(), type, occurredAt: nowIso(), data });
      let status = 0;
      try {
        const res = await fetch(w.url, { method: "POST", body, signal: AbortSignal.timeout(5000),
          headers: { "content-type": "application/json", "x-signature": sign(w.secret, body), "user-agent": "unis-quote-webhooks/1" } });
        status = res.status;
      } catch {
        status = 0;
      }
      await db.update(webhooks).set({ lastDeliveryAt: nowIso(), lastStatus: status }).where(eq(webhooks.id, w.id));
    }));
  })().catch(err => console.error("webhook delivery failed", err));
  try {
    waitUntil(work);
  } catch {
    /* outside Vercel (tests, local server): the promise simply runs */
  }
}
