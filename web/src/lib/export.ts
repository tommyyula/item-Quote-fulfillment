// Excel / JSON export of the proposal. ExcelJS is loaded on demand to keep the initial bundle small.
import type { Translator } from "../i18n";
import { chargeIndex, quoteLines } from "./engine";
import { addDays, dateText, money, pct, rateText, softLower, unitText } from "./format";
import type { PRow, PSection } from "./proposal";
import type { Catalog, Customer, Quote, QuoteData } from "./types";

export interface ProposalMeta { quote: Quote; customer: Customer | null; data: QuoteData; versionLabel: string }

export function serviceLabel(r: PRow, T: Translator): string {
  const base = T.tc(r.service) + (r.unitSuffix ? ` — ${T.t("e.perUnit", { unit: softLower(T.tc(r.unitSuffix)) })}` : "");
  return base;
}
export function descText(r: PRow, T: Translator): string {
  return r.descs ? r.descs.map(d => T.tc(d)).join(" ") : T.tc(r.desc);
}
export function qualifierText(r: PRow, T: Translator): string {
  return (r.qualifiers ?? []).map(q => `${T.tc(q.label)}: ${q.values.map(v => T.tc(v)).join(", ")}`).join(" · ");
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
const fileBase = (m: ProposalMeta) =>
  `${m.quote.number}_${(m.customer?.company || "customer").replace(/[^\w\-]+/g, "_")}_${m.versionLabel}`;

export async function exportExcel(cat: Catalog, sections: PSection[], m: ProposalMeta, T: Translator) {
  const buf = await buildExcel(cat, sections, m, T);
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(m)}.xlsx`);
}

/** Workbook in the proposal layout + a raw "Rate lines" sheet for billing setup. */
export async function buildExcel(cat: Catalog, sections: PSection[], m: ProposalMeta, T: Translator): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "UNIS Quote";
  const ws = wb.addWorksheet(T.t("p.toolbar"), { pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 46 }, { width: 58 }, { width: 22 }, { width: 18 }];
  const navy = "FF1F3864", band = "FFD9E1F2", grey = "FF595959";
  const h = m.data.header, c = m.customer;

  ws.addRow([T.t("app.brand")]).font = { bold: true, size: 16, color: { argb: navy } };
  ws.addRow([T.t("p.title")]).font = { bold: true, size: 13 };
  ws.addRow([]);
  const info: [string, string, string, string][] = [
    [T.t("p.company"), c?.company ?? "", T.t("p.quoteNo"), m.quote.number],
    [T.t("p.contact"), c?.contact ?? "", T.t("p.version"), m.versionLabel],
    [T.t("p.address"), c?.address ?? "", T.t("p.date"), dateText(h.effectiveDate, T)],
    [T.t("p.cityStateZip"), [c?.city, c?.state, c?.zip].filter(Boolean).join(", "), T.t("p.validUntil"), dateText(addDays(h.effectiveDate, h.validDays), T)],
    [T.t("p.phone"), c?.phone ?? "", T.t("p.facility"), h.facility ? T.tc(h.facility) : T.t("q.allFacilities")],
    [T.t("p.email"), c?.email ?? "", T.t("p.preparedBy"), h.preparedBy],
  ];
  for (const r of info) {
    const row = ws.addRow(r);
    row.getCell(1).font = { bold: true, color: { argb: grey } };
    row.getCell(3).font = { bold: true, color: { argb: grey } };
  }
  ws.addRow([]);
  const bt = ws.addRow([T.t("p.billedThrough")]);
  bt.font = { bold: true, color: { argb: "FFFFFFFF" } };
  bt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
  ws.mergeCells(bt.number, 1, bt.number, 4);

  for (const s of sections) {
    ws.addRow([]);
    const sr = ws.addRow([T.tc(s.label)]);
    sr.font = { bold: true, size: 12 };
    ws.mergeCells(sr.number, 1, sr.number, 4);
    const hr = ws.addRow([T.t("p.service"), T.t("p.desc"), T.t("p.rate"), T.t("p.unit")]);
    hr.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: band } };
    });
    for (const r of s.rows) {
      const isPct = r.rate?.kind === "pct";
      const service = r.type === "sub" ? `    ${qualifierText(r, T)}` : r.type === "min" ? `    ${T.t("p.minimum")}` : serviceLabel(r, T);
      const desc = r.type === "item" || r.type === "group" ? [qualifierText(r, T), descText(r, T)].filter(Boolean).join(" — ") : "";
      const row = ws.addRow([service, desc, rateText(r.rate, T), r.rate ? unitText(r.unit, T, { pct: isPct, minBasis: r.isMinBasis }) : ""]);
      row.alignment = { wrapText: true, vertical: "top" };
      if (r.type !== "sub" && r.type !== "min") row.getCell(1).font = { bold: true };
      row.getCell(3).alignment = { horizontal: "right", vertical: "top" };
    }
    const notes = [...s.settings.map(x => `${T.tc(x.label)}: ${T.tc(x.value)}`), s.note ? T.tc(s.note) : ""].filter(Boolean);
    for (const n of notes) {
      const nr = ws.addRow([`* ${n}`]);
      nr.font = { italic: true, size: 9, color: { argb: grey } };
      ws.mergeCells(nr.number, 1, nr.number, 4);
    }
  }
  ws.addRow([]);
  const tr = ws.addRow([T.t("p.terms", { days: h.validDays })]);
  tr.alignment = { wrapText: true };
  tr.height = 42;
  ws.mergeCells(tr.number, 1, tr.number, 4);
  if (h.notes) ws.addRow([`${T.t("q.notes")}: ${h.notes}`]);
  ws.addRow([]);
  ws.addRow([T.t("p.signUnis"), "", c?.company || T.t("p.signCustomer")]).font = { bold: true };
  for (const k of ["p.signature", "p.printed", "p.titleLbl", "p.date"]) ws.addRow([`${T.t(k)}: ____________________`, "", `${T.t(k)}: ____________________`]);

  // raw rate lines for billing setup
  const idx = chargeIndex(cat);
  const raw = wb.addWorksheet("Rate lines");
  raw.columns = [{ header: "Charge ID", width: 16 }, { header: "Charge", width: 30 }, { header: "Unit", width: 18 }, { header: "Conditions", width: 60 },
    { header: "Column", width: 12 }, { header: "Rate", width: 12 }, { header: "Benchmark", width: 12 }, { header: "System codes", width: 50 }];
  raw.getRow(1).font = { bold: true };
  for (const l of quoteLines(cat, m.data)) {
    raw.addRow([l.chargeId, idx[l.chargeId].charge.name, l.col === "min" ? `min per ${l.minBasis}` : l.unitLabel,
      l.dims.map(d => `${d.label}: ${d.value}`).join(" · "), l.col, l.pct ? pct(l.price) : money(l.price), l.pct ? pct(l.benchmark) : money(l.benchmark),
      idx[l.chargeId].charge.codes.join(", ")]);
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export function exportJson(m: ProposalMeta) {
  const payload = { quote: m.quote, customer: m.customer, exportedAt: new Date().toISOString() };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${fileBase(m)}.json`);
}
