import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import catalogJson from "../data/catalog.json";
import { translator } from "../i18n";
import { emptySel } from "./engine";
import { buildExcel } from "./export";
import { buildProposal } from "./proposal";
import type { Catalog, QuoteData } from "./types";

const cat = catalogJson as unknown as Catalog;

describe("excel export", () => {
  it("writes the proposal layout and raw rate lines", async () => {
    const s = { ...emptySel(), on: true };
    s.conds.offloadType = { on: true, values: ["Floor loaded"] };
    s.units.container = { on: true, driver: "caseCount" };
    const data: QuoteData = { header: { title: "T", facility: "Dallas, TX", effectiveDate: "2026-10-01", validDays: 60, preparedBy: "Me", notes: "" },
      selections: { "IN-OFFLOAD": s, "OT-RUSH": { ...emptySel(), on: true } } };
    const quote = { id: "q", number: "Q-2026-0009", customerId: "c", createdAt: "", updatedAt: "", status: "draft" as const, draft: data, versions: [] };
    const T = translator("en");
    const buf = await buildExcel(cat, buildProposal(cat, data), { quote, customer: null, data, versionLabel: "v1" }, T);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0];
    const texts: string[] = [];
    sheet.eachRow(r => r.eachCell(c => texts.push(String(c.value))));
    expect(texts).toContain("Q-2026-0009");
    expect(texts).toContain("Inbound Handling");
    expect(texts.some(t => t.includes("Case count in container: 0 - 500 cases"))).toBe(true);
    expect(texts).toContain("$490.00");
    expect(wb.getWorksheet("Rate lines")!.rowCount).toBe(1 + 5 + 1);
  });
});
