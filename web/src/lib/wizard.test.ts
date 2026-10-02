import { describe, expect, it } from "vitest";
import catalogJson from "../data/catalog.json";
import { chargeIndex, quoteLines } from "./engine";
import type { Catalog } from "./types";
import {
  emptyAnswers, extraOptions, pickOptions, prefill, stepComplete, suggestedStorage, visibleSteps, wizardSelections, type WizardAnswers,
} from "./wizard";

const cat = catalogJson as unknown as Catalog;
const header = { title: "", facility: "", effectiveDate: "2026-10-01", validDays: 90, preparedBy: "", notes: "" };
const answers = (x: Partial<WizardAnswers>): WizardAnswers => ({ ...emptyAnswers(), company: "Acme", ...x });
const lines = (a: WizardAnswers) => quoteLines(cat, { header, selections: wizardSelections(a) });

describe("steps follow the answers", () => {
  it("only asks about B2B or D2C orders for that kind of business", () => {
    expect(visibleSteps(answers({ channel: "D2C" }))).not.toContain("b2b");
    expect(visibleSteps(answers({ channel: "D2C" }))).toContain("d2c");
    expect(visibleSteps(answers({ channel: "B2B" }))).not.toContain("d2c");
    expect(visibleSteps(answers({ channel: "Both" }))).toEqual(expect.arrayContaining(["b2b", "d2c"]));
  });
  it("requires the answers a step depends on", () => {
    expect(stepComplete("company", emptyAnswers())).toBe(false);
    expect(stepComplete("channel", answers({}))).toBe(false);
    expect(stepComplete("returns", answers({ returns: false }))).toBe(true);
  });
  it("offers full-pallet picking only to B2B", () => {
    expect(pickOptions(answers({ channel: "D2C" }))).not.toContain("pallet");
    expect(pickOptions(answers({ channel: "B2B" }))).toContain("pallet");
  });
  it("suggests storage from how goods arrive", () => {
    expect(suggestedStorage(answers({ channel: "D2C", arrival: ["parcel"] }))).toEqual(["bin"]);
    expect(suggestedStorage(answers({ channel: "B2B", arrival: ["pallet"] }))).toEqual(["pallet"]);
  });
  it("recommends FNSKU labels to Amazon sellers and hides D2C-only extras from B2B", () => {
    const amz = extraOptions(cat, answers({ channel: "B2B", retailers: ["Amazon"] }));
    expect(amz.find(x => x.charge.id === "VA-FNSKU")?.recommended).toBe(true);
    expect(amz.some(x => x.charge.channel === "D2C")).toBe(false);
    expect(prefill("extras", answers({ channel: "D2C" })).extras).toContain("VA-PACKSLIP");
  });
});

describe("answers become a quote", () => {
  it("every selected charge exists in the catalog", () => {
    const idx = chargeIndex(cat);
    const a = answers({ channel: "Both", arrival: ["floor", "pallet", "parcel"], storage: ["pallet", "bin"], b2bShip: ["LTL", "Small parcel"],
                        retailers: ["Amazon"], platforms: ["Shopify"], pick: ["pallet", "case", "each"], returns: true, extras: ["VA-KIT"] });
    for (const id of Object.keys(wizardSelections(a))) expect(idx[id], id).toBeDefined();
    expect(lines(a).length).toBeGreaterThan(20);
  });
  it("a D2C parcel shipper gets pack, label and per-each pick, no pallet charges", () => {
    const s = wizardSelections(answers({ channel: "D2C", arrival: ["parcel"], storage: ["bin"], pick: ["each"], returns: false }));
    expect(s["OB-PACK"]?.on).toBe(true);
    expect(s["OB-LABEL"]?.on).toBe(true);
    expect(s["OB-PALLETBUILD"]).toBeUndefined();
    expect(s["RT-RETURN"]).toBeUndefined();
    expect(Object.keys(s["OB-PICK"].units)).toEqual(["each"]);
  });
  it("containers and pallets arriving split the offload rate by offload type", () => {
    const l = lines(answers({ channel: "B2B", arrival: ["floor", "pallet"], storage: ["pallet"], b2bShip: ["Truckload"], pick: ["pallet"], returns: false }))
      .filter(x => x.chargeId === "IN-OFFLOAD");
    expect(l.some(x => x.unitId === "container" && x.dims.some(d => d.value === "Floor loaded"))).toBe(true);
    expect(l.some(x => x.unitId === "pallet" && x.dims.some(d => d.value === "Palletized"))).toBe(true);
    expect(l.every(x => x.price != null)).toBe(true);
  });
  it("cooler storage becomes a temperature factor", () => {
    const s = wizardSelections(answers({ channel: "B2B", temperature: "both", storage: ["pallet"] }));
    expect(s["ST-STORAGE"].conds.temperature.values).toEqual(["Dry / ambient", "Cooler"]);
  });
});
