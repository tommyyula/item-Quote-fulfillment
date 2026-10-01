// Shared HTTP conventions from the OpenAPI contract: RFC 9457 problems, weak ETags + If-Match, paging, ids.
import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export interface Principal { kind: "user" | "key"; id: string; email: string; name: string; role: string }
export type Env = { Variables: { principal: Principal } };

export class Problem extends HTTPException {
  constructor(status: number, title: string, detail?: string, extra: Record<string, unknown> = {}) {
    const body = JSON.stringify({ type: "about:blank", title, status, ...(detail ? { detail } : {}), ...extra });
    super(status as 400, { res: new Response(body, { status, headers: { "content-type": "application/problem+json" } }) });
  }
}
export const notFound = (what: string) => new Problem(404, "Not found", `${what} does not exist`);
export const invalid = (errors: { path: string; message: string }[]) =>
  new Problem(422, "Validation failed", errors.map(e => `${e.path}: ${e.message}`).join("; "), { errors });

export const etag = (rowVersion: number) => `W/"${rowVersion}"`;
/** If-Match is optional; when sent it must match the current row version (else 412). */
export function checkIfMatch(c: Context, rowVersion: number) {
  const h = c.req.header("if-match");
  if (h && h !== "*" && !h.split(",").map(s => s.trim()).includes(etag(rowVersion)))
    throw new Problem(412, "Precondition failed", "The resource changed since you read it; reload and retry.", { etag: etag(rowVersion) });
}

export function paging(c: Context) {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1") || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(c.req.query("pageSize") ?? "50") || 50));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Client-supplied ids are accepted on create (the web app works optimistically); otherwise a UUID is issued. */
export function newId(requested?: unknown): string {
  return typeof requested === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(requested) ? requested : randomUUID();
}

export async function jsonBody<T = Record<string, unknown>>(c: Context): Promise<T> {
  const type = c.req.header("content-type") ?? "";
  // JSON only: also keeps cross-site HTML forms (which cannot send JSON without CORS preflight) from writing with a session cookie
  if (!/application\/(merge-patch\+)?json/.test(type)) throw new Problem(415, "Unsupported media type", "Send application/json");
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new Problem(400, "Bad request", "Body is not valid JSON");
  }
}

export const nowIso = () => new Date().toISOString();
export const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};
