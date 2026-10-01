// Mapback: every quote line -> an existing system charge code + the system conditions to configure.
// Status per line:
//   mapped         code exists and already uses every condition this line needs
//   new-condition  code exists, but at least one condition (e.g. "Receipt Type" on a return code) is not configured on it today
//   new-item       no system code yet -> create the item in the billing system before this quote can be billed
import { chargeIndex, quoteLines } from "./engine";
import type { Catalog, QuoteData, QuoteLine } from "./types";

export type MapStatus = "mapped" | "new-condition" | "new-item";
export interface SysCondition { key: string; value: string; supported: boolean }
export interface LineMapping {
  lineKey: string; chargeId: string; unitId: string | null; col: QuoteLine["col"]; minBasis?: string;
  price: number | null; status: MapStatus;
  code: string | null; initialCode: string | null;   // storage: recurring code + initial (at receipt) code
  systemName: string; systemUom: string;
  conditions: SysCondition[];
  suggestedName?: string;  // new-item: proposed system item name
  notes: string[];
}
export interface MappingSummary { total: number; mapped: number; newCondition: number; newItem: number }
export interface SetupItem {
  kind: "new-item" | "new-condition"; chargeId: string; code: string | null; systemName: string;
  suggestedName?: string; conditionKey?: string; values: string[]; lineCount: number;
}

type DriverCode = string | string[] | { range: string; incremental: string };

/** "0 - 500 cases" -> "0-500", "Over 2,500 cases" -> "over 2500"; other labels unchanged. */
export function systemRange(label: string): string {
  const n = (x: string) => x.replace(/,/g, "");
  const r = label.match(/(\d[\d,.]*)\s*-\s*(\d[\d,.]*)/);
  if (r && !/["']/.test(label)) return `${n(r[1])}-${n(r[2])}`;
  const o = label.match(/^over\s+(\d[\d,.]*)/i);
  if (o) return `over ${n(o[1])}`;
  return label;
}

function pickDriverCode(dc: DriverCode | undefined, calc: string | undefined): { code: string | null; initial: string | null } {
  if (!dc) return { code: null, initial: null };
  if (typeof dc === "string") return { code: dc, initial: null };
  if (Array.isArray(dc)) return { code: dc[0] ?? null, initial: dc[1] ?? null };
  return { code: calc === "incremental" ? dc.incremental : dc.range, initial: null };
}

export function mapLine(cat: Catalog, data: QuoteData, l: QuoteLine): LineMapping {
  const mb = cat.mapback;
  const sys = (code: string | null) => (code ? cat.systemCodes[code] : undefined);
  const base: LineMapping = { lineKey: l.key, chargeId: l.chargeId, unitId: l.unitId, col: l.col, minBasis: l.minBasis, price: l.price, status: "mapped",
    code: null, initialCode: null, systemName: "", systemUom: "", conditions: [], notes: [] };
  if (mb.notes[l.chargeId]) base.notes.push(mb.notes[l.chargeId]);

  // ---- simple charges
  if (!l.unitId) {
    const code = mb.simple[l.chargeId] ?? null;
    if (!code) return { ...base, status: "new-item", suggestedName: mb.newItems[l.chargeId] };
    return { ...base, code, systemName: sys(code)?.name ?? "", systemUom: sys(code)?.uom ?? "" };
  }

  // ---- builder charges
  const entry = mb.builder[l.chargeId]?.[l.unitId];
  if (!entry) return { ...base, status: "new-item", suggestedName: mb.newItems[l.chargeId] };
  const sel = data.selections[l.chargeId];
  const us = sel?.units[l.unitId];
  // the price driver decides the code (a minimum row has no dims: use the unit's chosen driver)
  const dId = l.dims.find(d => d.kind === "driver" && d.value !== "")?.id ?? (l.col === "min" ? us?.driver ?? us?.drivers?.[0] : undefined);
  let { code, initial } = dId
    ? pickDriverCode(entry.drivers?.[dId] as DriverCode, us?.calc?.[dId])
    : { code: entry.flat, initial: entry.initial ?? null };
  const conditions: SysCondition[] = [];
  // first / additional unit: split-rate code ("Unit Sequence") if the system has one
  if (l.col === "first" || l.col === "add") {
    if (entry.second) code = entry.second;
    conditions.push({ key: "Unit Sequence", value: l.col === "first" ? "first" : "additional", supported: false });
  }
  // storage: initial charge only when the quote bills initial storage
  const initialSetting = sel?.settings?.initial;
  if (initialSetting && /^No initial/i.test(initialSetting)) initial = null;
  if (!code) return { ...base, status: "new-item", suggestedName: mb.newItems[l.chargeId] };

  const keys = new Set(sys(code)?.keys ?? []);
  const supported = (k: string) => keys.has(k);
  for (const c of conditions) c.supported = supported(c.key);
  for (const d of l.dims) {
    if (d.kind === "driver" && d.value === "") continue; // flat row for this driver
    if (d.kind === "cond") {
      const cs = mb.conds[d.id];
      if (!cs?.key) { if (cs?.note && !base.notes.includes(cs.note)) base.notes.push(cs.note); continue; }
      const key = mb.chargeCondOverride[l.chargeId]?.[d.id] ?? cs.key;
      conditions.push({ key, value: cs.values[d.value] ?? d.value, supported: supported(key) });
    } else {
      const ds = mb.drivers[d.id];
      const key = ds.byCharge?.[l.chargeId] ?? ds.key;
      conditions.push({ key, value: ds.values?.[d.value] ?? systemRange(d.value), supported: supported(key) });
      const calcOpt = us?.calc?.[d.id];
      if (calcOpt) conditions.push({ key: "CalculationOption", value: calcOpt === "incremental" ? "Incremental" : "Tier", supported: supported("CalculationOption") });
    }
  }
  if (l.col === "min") conditions.push({ key: "Minimum charge", value: `per ${l.minBasis}`, supported: true });
  const status: MapStatus = conditions.every(c => c.supported) ? "mapped" : "new-condition";
  return { ...base, status, code, initialCode: initial, systemName: sys(code)?.name ?? "", systemUom: sys(code)?.uom ?? "", conditions };
}

export function mapQuote(cat: Catalog, data: QuoteData): LineMapping[] {
  return quoteLines(cat, data).map(l => mapLine(cat, data, l));
}

export function summarize(ms: LineMapping[]): MappingSummary {
  return { total: ms.length, mapped: ms.filter(m => m.status === "mapped").length,
           newCondition: ms.filter(m => m.status === "new-condition").length, newItem: ms.filter(m => m.status === "new-item").length };
}

/** What must be set up in the billing system before this quote can be billed, de-duplicated. */
export function setupList(cat: Catalog, ms: LineMapping[]): SetupItem[] {
  const out = new Map<string, SetupItem>();
  for (const m of ms) {
    if (m.status === "new-item") {
      const k = `item|${m.chargeId}|${m.unitId ?? ""}`;
      const it = out.get(k) ?? { kind: "new-item" as const, chargeId: m.chargeId, code: null, systemName: "", suggestedName: m.suggestedName, values: [], lineCount: 0 };
      it.lineCount++;
      out.set(k, it);
    } else if (m.status === "new-condition") {
      for (const c of m.conditions.filter(x => !x.supported)) {
        const k = `cond|${m.code}|${c.key}`;
        const it = out.get(k) ?? { kind: "new-condition" as const, chargeId: m.chargeId, code: m.code, systemName: m.systemName, conditionKey: c.key, values: [], lineCount: 0 };
        if (!it.values.includes(c.value)) it.values.push(c.value);
        it.lineCount++;
        out.set(k, it);
      }
    }
  }
  return [...out.values()];
}

/** Static check of the whole catalog: every option a user could pick that is not yet supported by the billing system. */
export function catalogGaps(cat: Catalog): { chargeId: string; option: string; kind: "new-item" | "new-condition"; code: string | null; detail: string }[] {
  const mb = cat.mapback, idx = chargeIndex(cat);
  const gaps: ReturnType<typeof catalogGaps> = [];
  const keysOf = (code: string | null) => new Set(code ? cat.systemCodes[code]?.keys ?? [] : []);
  for (const { charge: c } of Object.values(idx)) {
    if (c.kind === "simple") {
      if (!mb.simple[c.id]) gaps.push({ chargeId: c.id, option: c.unit, kind: "new-item", code: null, detail: mb.newItems[c.id] ?? "" });
      continue;
    }
    for (const u of c.units) {
      const e = mb.builder[c.id]?.[u.id];
      if (!e) { gaps.push({ chargeId: c.id, option: u.label, kind: "new-item", code: null, detail: "no code for this unit" }); continue; }
      const baseKeys = keysOf(e.flat);
      for (const cd of c.conds) {
        const cs = mb.conds[cd.id];
        if (!cs?.key) continue;
        const key = mb.chargeCondOverride[c.id]?.[cd.id] ?? cs.key;
        if (!baseKeys.has(key)) gaps.push({ chargeId: c.id, option: `${u.label} · rate by ${cd.label}`, kind: "new-condition", code: e.flat, detail: key });
      }
      for (const d of u.drivers) {
        const { code } = pickDriverCode(e.drivers?.[d.id] as DriverCode, "range");
        const key = mb.drivers[d.id].byCharge?.[c.id] ?? mb.drivers[d.id].key;
        if (!keysOf(code).has(key)) gaps.push({ chargeId: c.id, option: `${u.label} · priced by ${d.label}`, kind: "new-condition", code, detail: key });
      }
      if (u.second && !(e.second && keysOf(e.second).has("Unit Sequence")))
        gaps.push({ chargeId: c.id, option: `${u.label} · first / additional unit`, kind: "new-condition", code: e.second ?? e.flat, detail: "Unit Sequence" });
    }
  }
  return gaps;
}
