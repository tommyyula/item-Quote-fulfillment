import { describe, expect, it } from "vitest";
import catalogJson from "../data/catalog.json";
import { activeUnits, emptySel, passes, quoteLines, unitRows } from "./engine";
import { buildProposal, mergeRows } from "./proposal";
import type { BuilderCharge, Catalog, QuoteData } from "./types";

const cat = catalogJson as unknown as Catalog;
const charge = (id: string) => cat.categories.flatMap(c => c.charges).find(c => c.id === id)! as BuilderCharge;
const header = { title: "", facility: "", effectiveDate: "2026-10-01", validDays: 90, preparedBy: "", notes: "" };

describe("offload show/hide rules", () => {
  const off = charge("IN-OFFLOAD");
  it("palletized only hides case and each units", () => {
    const s = emptySel();
    s.conds.offloadType = { on: true, values: ["Palletized"] };
    const shown = off.units.filter(u => passes(off, s, u.when, false)).map(u => u.id);
    expect(shown).not.toContain("case");
    expect(shown).not.toContain("each");
    expect(shown).toContain("pallet");
  });
  it("floor loaded swaps pallet-count tier for case / SKU count", () => {
    const s = emptySel();
    s.conds.offloadType = { on: true, values: ["Floor loaded"] };
    const cont = off.units.find(u => u.id === "container")!;
    const drivers = cont.drivers.filter(d => passes(off, s, d.when, false)).map(d => d.id);
    expect(drivers).toEqual(["containerSize", "caseCount", "skuCount"]);
  });
  it("show all ignores the rules", () => {
    const s = emptySel();
    s.conds.offloadType = { on: true, values: ["Palletized"] };
    expect(off.units.every(u => passes(off, s, u.when, true))).toBe(true);
  });
  it("factor ticked without values is ignored", () => {
    const s = emptySel();
    s.conds.offloadType = { on: true, values: [] };
    s.units.case = { on: true };
    expect(activeUnits(off, s, false).map(u => u.key)).toEqual(["case"]);
  });
});

describe("order processing rows", () => {
  const ord = charge("OB-ORDER");
  const s = emptySel();
  s.on = true;
  s.conds.businessType = { on: true, values: ["B2B", "D2C"] };
  s.conds.shipMethod = { on: true, values: ["Truckload", "LTL", "Small parcel", "Will call"] };
  s.units.order = { on: true };
  it("drops impossible D2C x freight combinations", () => {
    const { rows } = unitRows(ord, s, ord.units[0], false);
    expect(rows.map(r => r.cells.join("/"))).toEqual(["B2B/Truckload", "B2B/LTL", "B2B/Small parcel", "B2B/Will call", "D2C/Small parcel"]);
  });
  it("combo default beats single-factor default", () => {
    const { rows } = unitRows(ord, s, ord.units[0], false);
    const d = Object.fromEntries(rows.map(r => [r.cells.join("/"), r.d]));
    expect(d["B2B/Small parcel"]).toBe(3);
    expect(d["D2C/Small parcel"]).toBe(2.5);
    expect(d["B2B/LTL"]).toBe(20);
  });
  it("proposal merges identical B2B freight rows into one", () => {
    const data: QuoteData = { header, selections: { "OB-ORDER": s } };
    const sec = buildProposal(cat, data).find(x => x.id === "outbound")!;
    const subs = sec.rows.filter(r => r.type === "sub");
    expect(subs).toHaveLength(3);
    const b2bFreight = subs.find(r => r.rate?.kind === "single" && r.rate.p === 20)!;
    expect(b2bFreight.qualifiers).toEqual([
      { label: "Channel (B2B / D2C)", values: ["B2B"] },
      { label: "Ship method", values: ["Truckload", "LTL", "Will call"] },
    ]);
  });
});

describe("proposal lifting", () => {
  it("single-value factor moves into the service heading instead of disappearing", () => {
    const s = emptySel();
    s.on = true;
    s.conds.offloadType = { on: true, values: ["Floor loaded"] };
    s.units.container = { on: true, driver: "caseCount" };
    const rows = buildProposal(cat, { header, selections: { "IN-OFFLOAD": s } })[0].rows;
    expect(rows[0]).toMatchObject({ type: "group", qualifiers: [{ label: "Offload type", values: ["Floor loaded"] }] });
    expect(rows[1].qualifiers).toEqual([{ label: "Case count in container", values: ["0 - 500 cases"] }]);
  });
});

describe("row-level applicability", () => {
  it("pallet pick only gets B2B rows, each pick gets both channels", () => {
    const pick = charge("OB-PICK");
    const s = emptySel();
    s.conds.businessType = { on: true, values: ["B2B", "D2C"] };
    s.units.pallet = { on: true };
    s.units.each = { on: true };
    const pallet = pick.units.find(u => u.id === "pallet")!, each = pick.units.find(u => u.id === "each")!;
    expect(unitRows(pick, s, pallet, false).rows.map(r => r.cells.join())).toEqual(["B2B"]);
    expect(unitRows(pick, s, each, false).rows.map(r => [r.cells.join(), r.d])).toEqual([["B2B", 1.05], ["D2C", 0.5]]);
  });
  it("case-count tiers only apply to floor-loaded rows when both offload types are priced", () => {
    const off = charge("IN-OFFLOAD");
    const s = emptySel();
    s.conds.offloadType = { on: true, values: ["Floor loaded", "Palletized"] };
    s.units.container = { on: true, driver: "caseCount" };
    const rows = unitRows(off, s, off.units.find(u => u.id === "container")!, false).rows;
    expect(rows).toHaveLength(5);
    expect(rows.every(r => r.cells[0] === "Floor loaded")).toBe(true);
  });
});

describe("mergeRows", () => {
  it("drops nothing when prices differ", () => {
    const rows = [{ sets: [["a"]], rate: { kind: "single" as const, p: 1 } }, { sets: [["b"]], rate: { kind: "single" as const, p: 2 } }];
    expect(mergeRows(1, rows, [["a", "b"]])).toHaveLength(2);
  });
});

describe("quote lines", () => {
  it("user price overrides benchmark, min line carries its basis", () => {
    const s = emptySel();
    s.on = true;
    s.conds.offloadType = { on: true, values: ["Palletized"] };
    s.units.pallet = { on: true, min: "load" };
    s.prices["pallet|Palletized|p"] = 11;
    const ls = quoteLines(cat, { header, selections: { "IN-OFFLOAD": s } });
    expect(ls.map(l => [l.col, l.price])).toEqual([["p", 11], ["min", 325]]);
    expect(ls[1].minBasis).toBe("load");
  });
  it("simple charge uses default until edited", () => {
    const ls = quoteLines(cat, { header, selections: { "OT-RUSH": { ...emptySel(), on: true } } });
    expect(ls[0].price).toBe(50);
  });
});

describe("default template", () => {
  const data: QuoteData = { header, selections: JSON.parse(JSON.stringify(cat.defaultPreset)) };
  const lines = quoteLines(cat, data);
  it("covers every proposal section except IT-only extras", () => {
    const ids = buildProposal(cat, data).map(s => s.id);
    expect(ids).toEqual(["inbound", "outbound", "storage", "returns", "vas", "accessorial", "it", "tech", "terms", "materials"]);
  });
  it("never prices impossible combinations", () => {
    const bad = lines.filter(l =>
      (l.chargeId === "OB-PICK" && l.unitId === "pallet" && l.dims.some(d => d.value === "D2C")) ||
      (l.chargeId === "IN-OFFLOAD" && l.unitId === "container" && l.dims.some(d => d.value === "Palletized")) ||
      (l.chargeId === "IN-OFFLOAD" && l.unitId === "pallet" && l.dims.some(d => d.value === "Floor loaded")) ||
      (l.chargeId === "RT-RETURN" && l.unitId === "package" && l.dims.some(d => d.value === "Retailer return (B2B)")));
    expect(bad).toEqual([]);
  });
  it("has a benchmark price on every line except intentionally blank tiers", () => {
    expect(lines.filter(l => l.price == null).map(l => l.key)).toEqual([]);
  });
});

describe("unit text", async () => {
  const { unitText } = await import("./format");
  const { translator } = await import("../i18n");
  it("keeps whole-phrase translations and softens merged units", () => {
    expect(unitText("Order / Receipt", translator("en"))).toBe("per order / receipt");
    expect(unitText("User / month", translator("en"))).toBe("per user / month");
    expect(unitText("SKU", translator("en"))).toBe("per SKU");
    expect(unitText("User / month", translator("zh"))).not.toContain("User");
  });
});
