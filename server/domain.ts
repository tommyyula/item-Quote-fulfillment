// Quote domain logic on the server. Pricing, mapback and proposal layout are the web app's own modules (web/src/lib),
// imported as-is, so the API and the UI can never compute a different rate sheet.
import catalogJson from "../web/src/data/catalog.json";
import { mapQuote, setupList, summarize, type LineMapping } from "../web/src/lib/codemap";
import { baseUnitId, chargeIndex, quoteLines } from "../web/src/lib/engine";
import type { Catalog, ChargeSel, QuoteData, VersionMapping } from "../web/src/lib/types";

export const catalog = catalogJson as unknown as Catalog;
export const charges = chargeIndex(catalog);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function newQuoteData(template: "default" | "blank" = "default", header: Partial<QuoteData["header"]> = {}): QuoteData {
  return {
    header: { title: "", facility: "", effectiveDate: new Date().toISOString().slice(0, 10), validDays: 90, preparedBy: "", notes: "", ...header },
    selections: template === "blank" ? {} : clone(catalog.defaultPreset),
  };
}

/** Snapshot data for a saved version: line count plus the full charge-code mapback. */
export function snapshot(data: QuoteData) {
  const lines = mapQuote(catalog, data);
  const mapping: VersionMapping = { summary: summarize(lines), lines };
  return { lineCount: quoteLines(catalog, data).length, mapping, setup: setupList(catalog, lines) };
}

type Err = { path: string; message: string };
function validateSelection(chargeId: string, s: ChargeSel, path: string, errors: Err[]) {
  const entry = charges[chargeId];
  if (!entry) return errors.push({ path, message: `unknown charge ${chargeId}` });
  if (typeof s !== "object" || s === null || typeof s.on !== "boolean") return errors.push({ path: `${path}.on`, message: "required boolean" });
  const c = entry.charge;
  if (s.price != null && typeof s.price !== "number") errors.push({ path: `${path}.price`, message: "must be a number" });
  for (const [k, v] of Object.entries(s.prices ?? {}))
    if (v != null && (typeof v !== "number" || !Number.isFinite(v))) errors.push({ path: `${path}.prices.${k}`, message: "must be a number or null" });
  if (c.kind !== "builder") return;
  for (const [condId, cs] of Object.entries(s.conds ?? {})) {
    const cond = c.conds.find(x => x.id === condId);
    if (!cond) { errors.push({ path: `${path}.conds.${condId}`, message: "unknown rate factor" }); continue; }
    for (const v of cs.values ?? []) if (!cond.free && !cond.values.includes(v)) errors.push({ path: `${path}.conds.${condId}`, message: `unknown value "${v}"` });
  }
  for (const [key, us] of Object.entries(s.units ?? {})) {
    const unit = c.units.find(u => u.id === baseUnitId(key));
    if (!unit) { errors.push({ path: `${path}.units.${key}`, message: "unknown unit" }); continue; }
    const drivers = [...(us.driver ? [us.driver] : []), ...(us.drivers ?? [])];
    for (const d of drivers) if (!unit.drivers.some(x => x.id === d)) errors.push({ path: `${path}.units.${key}`, message: `unknown price driver "${d}"` });
    if (us.min && !unit.mins.includes(us.min)) errors.push({ path: `${path}.units.${key}.min`, message: `unknown minimum basis "${us.min}"` });
  }
}

/** Shape + catalog validation of a draft (unknown charges, units, drivers or factor values -> 422). */
export function validateData(d: unknown): Err[] {
  const errors: Err[] = [];
  const data = d as QuoteData;
  if (!data || typeof data !== "object") return [{ path: "", message: "object required" }];
  if (!data.header || typeof data.header !== "object") errors.push({ path: "header", message: "required" });
  if (!data.selections || typeof data.selections !== "object") return [...errors, { path: "selections", message: "required" }];
  for (const [id, s] of Object.entries(data.selections)) validateSelection(id, s, `selections.${id}`, errors);
  return errors;
}
export const validateSel = (chargeId: string, s: ChargeSel) => {
  const errors: Err[] = [];
  validateSelection(chargeId, s, "selection", errors);
  return errors;
};

/** Rate lines with their mapping (GET /rate-lines). */
export function rateLines(data: QuoteData) {
  const maps = new Map<string, LineMapping>(mapQuote(catalog, data).map(m => [m.lineKey, m]));
  return quoteLines(catalog, data).map(l => ({ ...l, mapping: maps.get(l.key) }));
}

/** Rate-line differences between two drafts/versions (effective price = entered price, else benchmark). */
export function diff(from: QuoteData, to: QuoteData) {
  const index = (d: QuoteData) => new Map(quoteLines(catalog, d).map(l => [l.key, l]));
  const a = index(from), b = index(to);
  const label = (l: ReturnType<typeof quoteLines>[number]) =>
    [charges[l.chargeId]?.charge.name, l.unitLabel, ...l.dims.map(x => x.value), l.col === "min" ? `minimum per ${l.minBasis}` : ""].filter(Boolean).join(" · ");
  const eff = (l?: ReturnType<typeof quoteLines>[number]) => (l ? l.price ?? l.benchmark : null);
  const out: { kind: "added" | "removed" | "changed"; key: string; label: string; from: number | null; to: number | null }[] = [];
  for (const [k, l] of b) {
    const old = a.get(k);
    if (!old) out.push({ kind: "added", key: k, label: label(l), from: null, to: eff(l) });
    else if (eff(old) !== eff(l)) out.push({ kind: "changed", key: k, label: label(l), from: eff(old), to: eff(l) });
  }
  for (const [k, l] of a) if (!b.has(k)) out.push({ kind: "removed", key: k, label: label(l), from: eff(l), to: null });
  return out;
}
