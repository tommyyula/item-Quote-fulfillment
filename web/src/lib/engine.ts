// Pricing engine: show/hide rules and rate-row generation for the charge builders.
// Pure functions over (catalog, selections) so the UI, proposal and exports all share one logic.
import type {
  BuilderCharge, Catalog, Charge, ChargeSel, Cond, Driver, DimCell, QuoteData, QuoteLine, Unit, UnitSel, When,
} from "./types";

export const MAX_ROWS = 300;
export const ADDITIONAL_FACTOR = 0.5; // placeholder default for "each additional unit" = 50% of first

export function emptySel(): ChargeSel {
  return { on: false, conds: {}, units: {}, prices: {}, settings: {} };
}

export function chargeIndex(cat: Catalog) {
  const byId: Record<string, { charge: Charge; categoryId: string }> = {};
  cat.categories.forEach(c => c.charges.forEach(ch => (byId[ch.id] = { charge: ch, categoryId: c.id })));
  return byId;
}

/** Factors ticked in step 1 that have at least one value. */
export function activeConds(c: BuilderCharge, s: ChargeSel): { cond: Cond; values: string[] }[] {
  return c.conds
    .filter(cd => s.conds[cd.id]?.on)
    .map(cd => {
      const cs = s.conds[cd.id];
      const values = cd.free
        ? (cs.text || "").split(",").map(x => x.trim()).filter(Boolean)
        : cd.values.filter(v => cs.values.includes(v)); // keep catalog order
      return { cond: cd, values };
    })
    .filter(x => x.values.length > 0);
}

/** A unit / driver with `when` is hidden if a ticked factor has values and none of them is allowed. */
export function passes(c: BuilderCharge, s: ChargeSel, when: When, showAll: boolean): boolean {
  if (showAll) return true;
  const act = Object.fromEntries(activeConds(c, s).map(x => [x.cond.id, x.values]));
  return Object.entries(when || {}).every(([k, allowed]) => !act[k] || act[k].some(v => allowed.includes(v)));
}

export function chosenDriverIds(us: UnitSel | undefined, showAll: boolean): string[] {
  if (!us) return [];
  if (showAll) return us.drivers ?? (us.driver ? [us.driver] : []);
  return us.driver ? [us.driver] : [];
}

export function activeUnits(c: BuilderCharge, s: ChargeSel, showAll: boolean): Unit[] {
  return c.units.filter(u => s.units[u.id]?.on && passes(c, s, u.when, showAll));
}

export function activeDrivers(c: BuilderCharge, s: ChargeSel, u: Unit, showAll: boolean): Driver[] {
  const ids = chosenDriverIds(s.units[u.id], showAll);
  return u.drivers.filter(d => ids.includes(d.id) && passes(c, s, d.when, showAll));
}

export interface Dim { id: string; label: string; kind: "cond" | "driver"; vals: { v: string; d: number | null }[] }
export interface Row { cells: string[]; cond: Record<string, string>; d: number | null }

/** Cartesian product of factor values x driver values, minus impossible combinations. */
export function unitRows(c: BuilderCharge, s: ChargeSel, u: Unit, showAll: boolean): { dims: Dim[]; rows: Row[]; truncated: boolean } {
  const dims: Dim[] = [
    ...activeConds(c, s).map(x => ({
      id: x.cond.id, label: x.cond.label, kind: "cond" as const,
      vals: x.values.map(v => ({ v, d: u.by?.[x.cond.id]?.[v] ?? null })),
    })),
    ...activeDrivers(c, s, u, showAll).map(d => ({ id: d.id, label: d.label, kind: "driver" as const, vals: d.values })),
  ];
  let rows: Row[] = [{ cells: [], cond: {}, d: u.flat }];
  for (const dim of dims) {
    const next: Row[] = [];
    for (const r of rows)
      for (const val of dim.vals)
        next.push({
          cells: [...r.cells, val.v],
          cond: dim.kind === "cond" ? { ...r.cond, [dim.id]: val.v } : r.cond,
          d: val.d != null ? val.d : r.d,
        });
    rows = next;
  }
  rows = rows.filter(r => !(c.invalid || []).some(rule => Object.entries(rule).every(([k, vs]) => vs.includes(r.cond[k]))));
  // row-level applicability: a unit / driver limited to some factor values only prices rows with those values
  // (e.g. "Full pallet" pick is B2B-only, so no D2C x pallet row; case-count tiers only for floor-loaded rows)
  if (!showAll) {
    const whens = [u.when, ...activeDrivers(c, s, u, showAll).map(d => d.when)];
    rows = rows.filter(r => whens.every(w => Object.entries(w || {}).every(([k, allowed]) => r.cond[k] === undefined || allowed.includes(r.cond[k]))));
  }
  for (const r of rows) {
    const hit = (u.byCombo || []).find(x => Object.entries(x.when).every(([k, v]) => r.cond[k] === v));
    if (hit) r.d = hit.d;
  }
  return { dims, rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

export const cellKey = (unitId: string, cells: string[], col: string) => `${unitId}|${cells.join("|")}|${col}`;
export const minKey = (unitId: string, basis: string) => `${unitId}|MIN|${basis}`;

export function benchmarkFor(d: number | null, col: string): number | null {
  if (d == null) return null;
  return col === "add" ? Math.round(d * ADDITIONAL_FACTOR * 100) / 100 : d;
}

/** Every priced cell of a quote, in catalog order. */
export function quoteLines(cat: Catalog, data: QuoteData, globalShowAll = false): QuoteLine[] {
  const out: QuoteLine[] = [];
  for (const category of cat.categories) {
    for (const c of category.charges) {
      const s = data.selections[c.id];
      if (!s?.on) continue;
      if (c.kind === "simple") {
        out.push({
          key: `${c.id}||p`, chargeId: c.id, categoryId: category.id, unitId: null, unitLabel: c.unit, dims: [], col: "p",
          price: s.price === undefined ? c.default : s.price, benchmark: c.default, pct: c.pct, lo: c.lo, hi: c.hi,
        });
        continue;
      }
      const showAll = globalShowAll || !!s.showAll;
      for (const u of activeUnits(c, s, showAll)) {
        const us = s.units[u.id];
        const { dims, rows } = unitRows(c, s, u, showAll);
        const cols = us.second ? (["first", "add"] as const) : (["p"] as const);
        for (const r of rows)
          for (const col of cols) {
            const key = cellKey(u.id, r.cells, col);
            const bench = benchmarkFor(r.d, col);
            const cells: DimCell[] = dims.map((dm, i) => ({ id: dm.id, label: dm.label, value: r.cells[i], kind: dm.kind }));
            out.push({
              key: `${c.id}|${key}`, chargeId: c.id, categoryId: category.id, unitId: u.id, unitLabel: u.label, dims: cells, col,
              price: key in s.prices ? s.prices[key] : bench, benchmark: bench, pct: false, lo: u.lo, hi: u.hi,
            });
          }
        if (us.min) {
          const k = minKey(u.id, us.min);
          const bench = u.minDefault?.[us.min] ?? null;
          out.push({
            key: `${c.id}|${k}`, chargeId: c.id, categoryId: category.id, unitId: u.id, unitLabel: u.label, dims: [], col: "min",
            minBasis: us.min, price: k in s.prices ? s.prices[k] : bench, benchmark: bench, pct: false,
          });
        }
      }
    }
  }
  return out;
}

/** Warnings shown in the builder (factor ticked without values, unit without price etc.). */
export function builderIssues(c: BuilderCharge, s: ChargeSel, showAll: boolean): string[] {
  const issues: string[] = [];
  for (const cd of c.conds) {
    const cs = s.conds[cd.id];
    if (cs?.on && !activeConds(c, s).some(x => x.cond.id === cd.id)) issues.push(`noValues:${cd.id}`);
  }
  if (!activeUnits(c, s, showAll).length) issues.push("noUnit");
  return issues;
}

export function outOfRange(price: number | null, lo?: number, hi?: number): "low" | "high" | null {
  if (price == null || lo == null || hi == null) return null;
  if (price < lo) return "low";
  if (price > hi) return "high";
  return null;
}
