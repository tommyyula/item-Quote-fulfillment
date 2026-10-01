import { describe, expect, it } from "vitest";
import catalogJson from "../data/catalog.json";
import { catalogGaps, mapQuote, setupList, summarize, systemRange } from "./codemap";
import { emptySel } from "./engine";
import type { Catalog, QuoteData } from "./types";

const cat = catalogJson as unknown as Catalog;
const header = { title: "", facility: "", effectiveDate: "2026-10-01", validDays: 90, preparedBy: "", notes: "" };
const preset = (): QuoteData => ({ header, selections: JSON.parse(JSON.stringify(cat.defaultPreset)) });

describe("mapback", () => {
  const ms = mapQuote(cat, preset());
  const find = (charge: string, unit: string | null, pred: (m: (typeof ms)[number]) => boolean = () => true) =>
    ms.find(m => m.chargeId === charge && m.unitId === unit && pred(m))!;

  it("every line resolves to a code or is reported as a new item", () => {
    expect(ms.every(m => m.code || m.status === "new-item")).toBe(true);
    expect(ms.filter(m => m.status === "new-item").every(m => m.suggestedName)).toBe(true);
  });
  it("floor-loaded case tiers map to HANDLING-0129 with system conditions", () => {
    const m = find("IN-OFFLOAD", "container", x => x.conditions.some(c => c.value === "0-500"));
    expect(m.code).toBe("HANDLING-0129");
    expect(m.status).toBe("mapped");
    expect(m.conditions).toEqual([
      { key: "OFFLoad Type", value: "Floor Loaded", supported: true },
      { key: "Case Qty", value: "0-500", supported: true },
    ]);
  });
  it("palletized receiving minimum stays on the pallet code", () => {
    expect(find("IN-OFFLOAD", "pallet", x => x.col === "min").code).toBe("HANDLING-0113");
  });
  it("D2C order processing maps to Business Type B2C", () => {
    const m = find("OB-ORDER", "order", x => x.conditions.some(c => c.value === "B2C"));
    expect(m.code).toBe("HANDLING-0093");
    expect(m.status).toBe("mapped");
  });
  it("storage carries recurring and initial codes", () => {
    const m = find("ST-STORAGE", "pallet");
    expect([m.code, m.initialCode]).toEqual(["STORAGE INCOME-0004", "STORAGE INCOME-0017"]);
  });
  it("return type is flagged as a new condition on return codes", () => {
    const m = find("RT-RETURN", "case");
    expect(m.status).toBe("new-condition");
    expect(m.conditions.find(c => !c.supported)?.key).toBe("Receipt Type");
  });
  it("pallets have no code yet", () => {
    expect(find("OT-PALLET-A", null)).toMatchObject({ status: "new-item", suggestedName: "PALLET CHARGE - GRADE A" });
  });
  it("setup list is de-duplicated", () => {
    const list = setupList(cat, ms);
    const keys = list.map(i => `${i.kind}|${i.code}|${i.conditionKey ?? i.chargeId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(summarize(ms).total).toBe(ms.length);
  });
});

describe("each pick first / additional", () => {
  it("uses the split-rate code with Unit Sequence", () => {
    const s = { ...emptySel(), on: true };
    s.units.each = { on: true, second: true };
    const ms = mapQuote(cat, { header, selections: { "OB-PICK": s } });
    expect(ms.map(m => [m.code, m.status, m.conditions[0]?.value])).toEqual([["HANDLING-0062", "mapped", "first"], ["HANDLING-0062", "mapped", "additional"]]);
  });
});

describe("helpers", () => {
  it("range labels", () => {
    expect(systemRange("0 - 500 cases")).toBe("0-500");
    expect(systemRange("Over 2,500 cases")).toBe("over 2500");
    expect(systemRange('55" - 60"')).toBe('55" - 60"');
  });
  it("catalog gaps list only real gaps", () => {
    const gaps = catalogGaps(cat);
    expect(gaps.some(g => g.chargeId === "OT-PALLET-A" && g.kind === "new-item")).toBe(true);
    expect(gaps.some(g => g.code === "HANDLING-0129" && g.detail === "Case Qty")).toBe(false);
  });
});
