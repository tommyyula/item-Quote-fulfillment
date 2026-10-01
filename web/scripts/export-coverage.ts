// "Standard Rate Sheet - Common Items Coverage.xlsx": how each of the 44 Final Common Billing Items is covered.
// Run: npx vite-node scripts/export-coverage.ts <outDir>
import ExcelJS from "exceljs";
import catalogJson from "../src/data/catalog.json";
import { mapQuote } from "../src/lib/codemap";
import { chargeIndex, quoteLines } from "../src/lib/engine";
import { money, pct } from "../src/lib/format";
import type { Catalog, QuoteData } from "../src/lib/types";

const cat = catalogJson as unknown as Catalog;
const idx = chargeIndex(cat);
const data: QuoteData = { header: { title: "", facility: "", effectiveDate: "", validDays: 90, preparedBy: "", notes: "" },
                          selections: JSON.parse(JSON.stringify(cat.standardTemplate.selections)) };
const ql = quoteLines(cat, data), ms = mapQuote(cat, data);
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("44 common items");
ws.columns = [{ header: "#", width: 5 }, { header: "Charge code", width: 28 }, { header: "System item", width: 40 }, { header: "UOM", width: 14 },
  { header: "High-level customers", width: 12 }, { header: "Covered as", width: 14 }, { header: "Rate-sheet charge", width: 34 },
  { header: "Unit / pricing method", width: 30 }, { header: "Rate lines", width: 10 }, { header: "Rates (standard)", width: 44 }];
ws.getRow(1).font = { bold: true };
ws.views = [{ state: "frozen", ySplit: 1 }];
cat.commonItems.forEach((c, i) => {
  const hits = ms.map((m, k) => ({ m, l: ql[k] })).filter(({ m }) => m.code === c.code || m.initialCode === c.code || m.altCodes.includes(c.code));
  const h = hits[0]?.m;
  const how = !h ? "NOT COVERED" : h.code === c.code ? "charge code" : h.initialCode === c.code ? "initial storage" : "alternate code";
  const unit = h?.unitKey ? `${hits[0].l.unitLabel}${h.unitKey.includes("#") ? ` (method ${h.unitKey.split("#")[1]})` : ""}` : "";
  const rates = [...new Set(hits.map(({ l }) => (l.pct ? pct(l.price) : money(l.price))))].join(", ");
  const r = ws.addRow([i + 1, c.code, c.name, c.uom, c.hlCustomers, how, h ? idx[h.chargeId].charge.name : "", unit, hits.length, rates]);
  if (!h) r.font = { bold: true, color: { argb: "FFE01529" } };
});
const out = `${process.argv[2] ?? "."}/Standard Rate Sheet - Common Items Coverage.xlsx`;
await wb.xlsx.writeFile(out);
console.log("wrote", out);
