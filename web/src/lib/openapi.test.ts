// Keeps the published API contract (public/api/openapi.json) in step with the app's real objects.
import { describe, expect, it } from "vitest";
import spec from "../../public/api/openapi.json";
import catalogJson from "../data/catalog.json";
import { mapQuote, setupList } from "./codemap";
import { quoteLines } from "./engine";
import type { Catalog, QuoteData } from "./types";

const cat = catalogJson as unknown as Catalog;
type Schema = { properties?: Record<string, unknown>; allOf?: Schema[]; required?: string[]; enum?: string[]; $ref?: string };
const schemas = (spec as unknown as { components: { schemas: Record<string, Schema> } }).components.schemas;
const props = (name: string): Set<string> => {
  const walk = (s: Schema): string[] => [
    ...Object.keys(s.properties ?? {}),
    ...(s.allOf ?? []).flatMap(x => walk(x.$ref ? schemas[x.$ref.split("/").pop()!] : x)),
  ];
  return new Set(walk(schemas[name]));
};
const data: QuoteData = { header: { title: "", facility: "", effectiveDate: "2026-10-01", validDays: 90, preparedBy: "", notes: "" },
                          selections: JSON.parse(JSON.stringify(cat.defaultPreset)) };

describe("OpenAPI contract", () => {
  it("documents every field of a line mapping and setup item", () => {
    const ms = mapQuote(cat, data);
    for (const m of ms) for (const k of Object.keys(m)) expect(props("LineMapping"), `LineMapping.${k}`).toContain(k);
    for (const it of setupList(cat, ms)) for (const k of Object.keys(it)) expect(props("SetupItem"), `SetupItem.${k}`).toContain(k);
  });
  it("documents every field of a rate line", () => {
    for (const l of quoteLines(cat, data)) for (const k of Object.keys(l)) expect(props("RateLine"), `RateLine.${k}`).toContain(k);
  });
  it("documents selection, header and customer fields", () => {
    for (const sel of Object.values(data.selections)) for (const k of Object.keys(sel)) expect(props("ChargeSelection")).toContain(k);
    for (const k of Object.keys(data.header)) expect(props("QuoteHeader")).toContain(k);
    for (const k of ["company", "code", "contact", "phone", "email", "address", "city", "state", "zip", "channel", "id", "createdAt"])
      expect(props("Customer")).toContain(k);
  });
  it("uses the same mapback statuses", () => {
    const st = (schemas.LineMapping.properties!.status as Schema).enum;
    expect(st).toEqual(["mapped", "new-condition", "new-item"]);
  });
});
