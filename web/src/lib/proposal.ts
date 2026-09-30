// Turns quote lines into a customer rate sheet laid out like the UNIS Business Proposal template:
// sections in template order, one row per service, identical-price variants merged, qualifiers shown as sub-rows.
// Output is language-neutral (English catalog strings); the renderer translates.
import { chargeIndex, quoteLines } from "./engine";
import type { BuilderCharge, Catalog, QuoteData, QuoteLine } from "./types";

export interface Qualifier { label: string; values: string[] }
export type Rate =
  | { kind: "single"; p: number | null }
  | { kind: "split"; first: number | null; add: number | null }
  | { kind: "pct"; p: number | null };
export interface PRow {
  type: "item" | "group" | "sub" | "min";
  service: string;            // catalog string (charge name / merge-group label) - empty on sub rows
  unitSuffix?: string;        // unit label when a charge has several units
  desc?: string;
  descs?: string[];           // merged synonym rows: member descriptions, translated one by one
  qualifiers?: Qualifier[];
  rate?: Rate;
  unit?: string;              // unit label (catalog) or min basis
  isMinBasis?: boolean;
}
export interface PSection { id: string; label: string; note: string; rows: PRow[]; settings: { label: string; value: string }[] }

const sig = (r: Rate) => JSON.stringify(r);

interface MRow { sets: string[][]; rate: Rate }

/** Merge rows that differ in exactly one dimension and share the same rate; repeat until stable. */
export function mergeRows(dimCount: number, rows: MRow[], order: string[][]): MRow[] {
  let cur = rows.map(r => ({ sets: r.sets.map(s => [...s]), rate: r.rate }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let d = 0; d < dimCount; d++) {
      const groups = new Map<string, MRow[]>();
      for (const r of cur) {
        const k = JSON.stringify([r.sets.filter((_, i) => i !== d), sig(r.rate)]);
        (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
      }
      if ([...groups.values()].some(g => g.length > 1)) changed = true;
      cur = [...groups.values()].map(g => {
        if (g.length === 1) return g[0];
        const u = new Set(g.flatMap(r => r.sets[d]));
        const sets = g[0].sets.map((s, i) => (i === d ? order[d].filter(v => u.has(v)) : s));
        return { sets, rate: g[0].rate };
      });
    }
  }
  return cur;
}

export function buildProposal(cat: Catalog, data: QuoteData): PSection[] {
  const idx = chargeIndex(cat);
  const lines = quoteLines(cat, data);
  const sectionOf = (chargeId: string) =>
    cat.proposal.materials.includes(chargeId) ? "materials" : cat.proposal.categoryToSection[idx[chargeId].categoryId];
  const sections: PSection[] = cat.proposal.sections.map(s => ({ ...s, rows: [], settings: [] }));
  const secById = Object.fromEntries(sections.map(s => [s.id, s]));

  // group lines by charge (keeps catalog order)
  const byCharge = new Map<string, QuoteLine[]>();
  for (const l of lines) (byCharge.get(l.chargeId) ?? byCharge.set(l.chargeId, []).get(l.chargeId)!).push(l);

  // simple-charge synonym groups (merged only when every selected member has the same rate & kind)
  const mergedInto: Record<string, string> = {};
  for (const g of cat.proposal.mergeGroups) {
    const present = g.members.filter(m => byCharge.has(m));
    if (present.length < 2) continue;
    const ls = present.map(m => byCharge.get(m)![0]);
    if (ls.every(l => l.price === ls[0].price && l.pct === ls[0].pct)) {
      const units = [...new Set(present.map(m => (idx[m].charge as { unit: string }).unit))];
      secById[sectionOf(present[0])].rows.push({
        type: "item", service: g.label, descs: present.map(m => idx[m].charge.desc),
        rate: ls[0].pct ? { kind: "pct", p: ls[0].price } : { kind: "single", p: ls[0].price }, unit: units.join(" / "),
      });
      present.forEach(m => (mergedInto[m] = g.id));
    }
  }

  for (const [chargeId, ls] of byCharge) {
    if (mergedInto[chargeId]) continue;
    const c = idx[chargeId].charge;
    const sec = secById[sectionOf(chargeId)];
    if (c.kind === "simple") {
      const l = ls[0];
      sec.rows.push({ type: "item", service: c.name, desc: c.desc, rate: l.pct ? { kind: "pct", p: l.price } : { kind: "single", p: l.price }, unit: c.unit });
      continue;
    }
    const b = c as BuilderCharge;
    const sel = data.selections[chargeId];
    b.settings.forEach(st => sec.settings.push({ label: st.label, value: sel.settings[st.id] || st.options[0] }));
    const unitIds = [...new Set(ls.map(l => l.unitId!))];
    for (const unitId of unitIds) {
      const u = b.units.find(x => x.id === unitId)!;
      const ul = ls.filter(l => l.unitId === unitId);
      const priced = ul.filter(l => l.col !== "min");
      const mins = ul.filter(l => l.col === "min");
      const dims = priced[0]?.dims.map(d => ({ id: d.id, label: d.label })) ?? [];
      // collapse first/additional columns into one rate per row
      const rowMap = new Map<string, { cells: string[]; rate: Rate }>();
      for (const l of priced) {
        const k = l.dims.map(d => d.value).join("|");
        const r = rowMap.get(k) ?? rowMap.set(k, { cells: l.dims.map(d => d.value), rate: { kind: "single", p: null } }).get(k)!;
        if (l.col === "p") r.rate = { kind: "single", p: l.price };
        else {
          const prev = r.rate.kind === "split" ? r.rate : { kind: "split" as const, first: null, add: null };
          r.rate = { ...prev, [l.col === "first" ? "first" : "add"]: l.price };
        }
      }
      const order = dims.map((_, i) => [...new Set([...rowMap.values()].map(r => r.cells[i]))]);
      let merged = mergeRows(dims.length, [...rowMap.values()].map(r => ({ sets: r.cells.map(v => [v]), rate: r.rate })), order);
      // a dimension with the same values on every row does not split the price: lift it into the service heading
      const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
      const keep = dims.map((_, i) => !merged.every(r => same(r.sets[i], merged[0].sets[i])));
      const lifted = dims.map((d, i) => ({ label: d.label, values: merged[0]?.sets[i] ?? [] })).filter((_, i) => !keep[i]);
      const suffix = unitIds.length > 1 ? u.label : undefined;
      if (merged.length === 1 && !mins.length) {
        sec.rows.push({ type: "item", service: b.name, unitSuffix: suffix, desc: b.desc, rate: merged[0].rate, unit: u.label,
                        qualifiers: lifted });
        continue;
      }
      sec.rows.push({ type: "group", service: b.name, unitSuffix: suffix, desc: b.desc, qualifiers: lifted });
      merged = merged.filter(Boolean);
      for (const m of merged) sec.rows.push({ type: "sub", service: "", qualifiers: qual(dims, m.sets, keep), rate: m.rate, unit: u.label });
      for (const m of mins) sec.rows.push({ type: "min", service: "", rate: { kind: "single", p: m.price }, unit: m.minBasis, isMinBasis: true });
    }
  }
  return sections.filter(s => s.rows.length);
}

function qual(dims: { id: string; label: string }[], sets: string[][], keep: boolean[]): Qualifier[] {
  return dims.map((d, i) => ({ label: d.label, values: sets[i] })).filter((_, i) => keep[i]);
}
