// Writes "Charge Code Mapback - Setup List.xlsx": what must exist in the billing system before quotes can be billed.
// Run: npx vite-node scripts/export-mapback.ts <outDir>
import ExcelJS from "exceljs";
import catalogJson from "../src/data/catalog.json";
import { catalogGaps, mapQuote, setupList } from "../src/lib/codemap";
import { chargeIndex } from "../src/lib/engine";
import type { Catalog, QuoteData } from "../src/lib/types";

const cat = catalogJson as unknown as Catalog;
const idx = chargeIndex(cat);
const out = process.argv[2] ?? ".";
const wb = new ExcelJS.Workbook();
const head = (ws: ExcelJS.Worksheet, cols: [string, number][]) => {
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
};

// 1. new charge items (no code anywhere) - create these first
const newItems = Object.entries(cat.mapback.newItems);
const s1 = wb.addWorksheet("1. New charge items");
head(s1, [["Charge ID", 15], ["Quote charge", 34], ["Suggested system item name", 40], ["Unit", 16], ["Category", 22], ["Main / Advanced", 12], ["In default template", 12]]);
for (const [id, name] of newItems) {
  const c = idx[id].charge;
  s1.addRow([id, c.name, name, c.kind === "simple" ? c.unit : "", cat.categories.find(x => x.id === idx[id].categoryId)!.name, c.tier,
             id in cat.defaultPreset ? "yes" : ""]);
}

// 2. conditions to add on existing codes, for every option a user can pick
const gaps = catalogGaps(cat).filter(g => g.kind === "new-condition");
const s2 = wb.addWorksheet("2. New conditions");
head(s2, [["Charge", 28], ["Option", 46], ["Charge code", 24], ["System item", 34], ["Condition to add", 24], ["Used today (invoice lines)", 14]]);
for (const g of gaps) s2.addRow([idx[g.chargeId].charge.name, g.option, g.code ?? "", g.code ? cat.systemCodes[g.code]?.name : "", g.detail,
                                  g.code ? cat.systemCodes[g.code]?.invoiceLines : ""]);

// 3. default template: exactly what a standard quote needs
const data: QuoteData = { header: { title: "", facility: "", effectiveDate: "", validDays: 90, preparedBy: "", notes: "" },
                          selections: JSON.parse(JSON.stringify(cat.defaultPreset)) };
const ms = mapQuote(cat, data);
const s3 = wb.addWorksheet("3. Default template check");
head(s3, [["Type", 16], ["Charge", 30], ["Charge code", 24], ["System item", 34], ["Action", 60], ["Values", 50], ["Rate lines", 10]]);
for (const it of setupList(cat, ms))
  s3.addRow([it.kind, idx[it.chargeId].charge.name, it.code ?? "", it.systemName,
             it.kind === "new-item" ? `Create item "${it.suggestedName}"` : `Add condition "${it.conditionKey}" to ${it.code}`, it.values.join(", "), it.lineCount]);

// 4. the full map: which code each quote option bills to
const s4 = wb.addWorksheet("4. Full code map");
head(s4, [["Charge ID", 15], ["Charge", 30], ["Unit / option", 34], ["Charge code", 26], ["Initial storage code", 22], ["System item", 36], ["System UOM", 14], ["System conditions in use", 60]]);
const sysRow = (code: string | undefined) => (code ? [cat.systemCodes[code]?.name, cat.systemCodes[code]?.uom, cat.systemCodes[code]?.keys.join(", ")] : ["", "", ""]);
for (const [id, code] of Object.entries(cat.mapback.simple)) {
  const s = sysRow(code);
  s4.addRow([id, idx[id].charge.name, "(flat)", code, "", s[0], s[1], s[2]]);
}
for (const [id, units] of Object.entries(cat.mapback.builder)) {
  for (const [unitId, e] of Object.entries(units)) {
    const u = (idx[id].charge as { units: { id: string; label: string; drivers: { id: string; label: string }[] }[] }).units.find(x => x.id === unitId)!;
    let s = sysRow(e.flat);
    s4.addRow([id, idx[id].charge.name, `${u.label} (flat)`, e.flat, e.initial ?? "", s[0], s[1], s[2]]);
    for (const d of u.drivers) {
      const dc = e.drivers?.[d.id];
      const codes = typeof dc === "string" ? [dc, ""] : Array.isArray(dc) ? dc : dc ? [`${dc.range} (range) / ${dc.incremental} (incremental)`, ""] : ["", ""];
      s = sysRow(typeof dc === "string" ? dc : Array.isArray(dc) ? dc[0] : dc?.range);
      s4.addRow([id, idx[id].charge.name, `${u.label} · priced by ${d.label}`, codes[0], codes[1] ?? "", s[0], s[1], s[2]]);
    }
    if (e.second) { s = sysRow(e.second); s4.addRow([id, idx[id].charge.name, `${u.label} · first / additional`, e.second, "", s[0], s[1], s[2]]); }
  }
}
const file = `${out}/Charge Code Mapback - Setup List.xlsx`;
await wb.xlsx.writeFile(file);
console.log(`wrote ${file}\nnew items: ${newItems.length}; new conditions: ${gaps.length}; default template:`, setupList(cat, ms).length, "setup actions");
for (const [id, name] of newItems) console.log(`  NEW ITEM  ${id.padEnd(16)} ${name}${id in cat.defaultPreset ? "   [default template]" : ""}`);
for (const g of gaps) console.log(`  NEW COND  ${g.code?.padEnd(22)} + ${g.detail.padEnd(22)} ${idx[g.chargeId].charge.name}: ${g.option}`);
