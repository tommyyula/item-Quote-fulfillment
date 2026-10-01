// Read-only views of the generated catalog (scripts/rate-catalog -> web/src/data/catalog.json).
// Catalog editing stays in the build pipeline for now; write operations answer 501 so integrators see a clear status.
import { Hono } from "hono";
import type { UnitCodes } from "../../web/src/lib/types";
import { catalogGaps } from "../../web/src/lib/codemap";
import { catalog, charges } from "../domain";
import { notFound, Problem, type Env } from "../http";

const notYet = () => {
  throw new Problem(501, "Not implemented", "Catalog and mapback rules are maintained in the rate-catalog build; editing through the API is planned.");
};

/** Flatten catalog.mapback into ChargeCodeMapRule records (id = chargeId:unitId:driverId:column). */
function mapRules() {
  const rules: Record<string, unknown>[] = [];
  for (const [chargeId, code] of Object.entries(catalog.mapback.simple)) rules.push({ id: `${chargeId}:::p`, chargeId, column: "p", code });
  for (const [chargeId, units] of Object.entries(catalog.mapback.builder)) {
    for (const [unitId, e] of Object.entries(units) as [string, UnitCodes][]) {
      rules.push({ id: `${chargeId}:${unitId}::p`, chargeId, unitId, column: "p", code: e.flat, ...(e.initial ? { initialCode: e.initial } : {}) });
      if (e.second) rules.push({ id: `${chargeId}:${unitId}::add`, chargeId, unitId, column: "add", code: e.second });
      for (const [driverId, dc] of Object.entries(e.drivers ?? {})) {
        if (typeof dc === "string") rules.push({ id: `${chargeId}:${unitId}:${driverId}:p`, chargeId, unitId, driverId, column: "p", code: dc });
        else if (Array.isArray(dc)) rules.push({ id: `${chargeId}:${unitId}:${driverId}:p`, chargeId, unitId, driverId, column: "p", code: dc[0], initialCode: dc[1] });
        else for (const calc of ["range", "incremental"] as const)
          rules.push({ id: `${chargeId}:${unitId}:${driverId}:p:${calc}`, chargeId, unitId, driverId, calc, column: "p", code: dc[calc] });
      }
    }
  }
  return rules;
}

export function catalogRoutes() {
  const r = new Hono<Env>();
  const tag = `"${catalog.version}"`;

  r.get("/catalog", c => {
    if (c.req.header("if-none-match") === tag) return c.body(null, 304);
    c.header("ETag", tag);
    return c.json(catalog);
  });
  r.get("/catalog/charges", c => {
    const { categoryId, tier, channel } = c.req.query();
    return c.json(Object.values(charges).filter(({ categoryId: cat, charge }) =>
      (!categoryId || cat === categoryId) && (!tier || charge.tier === tier) &&
      (!channel || charge.channel === channel || charge.channel === "Both" || channel === "Both")).map(x => ({ ...x.charge, categoryId: x.categoryId })));
  });
  r.get("/catalog/charges/:id", c => {
    const x = charges[c.req.param("id")];
    if (!x) throw notFound("Charge");
    return c.json({ ...x.charge, categoryId: x.categoryId });
  });
  r.post("/catalog/charges", notYet);
  r.put("/catalog/charges/:id", notYet);
  r.delete("/catalog/charges/:id", notYet);
  r.get("/catalog/default-template", c => c.json(catalog.defaultPreset));
  r.put("/catalog/default-template", notYet);

  r.get("/system-charge-codes", c => {
    const q = c.req.query("q")?.toLowerCase(), cat = c.req.query("category"), inUse = c.req.query("inUse");
    return c.json(Object.entries(catalog.systemCodes).map(([code, s]) => ({ code, ...s }))
      .filter(s => (!q || `${s.code} ${s.name}`.toLowerCase().includes(q)) && (!cat || s.category === cat) &&
                   (inUse !== "true" || s.invoiceLines > 0) && (inUse !== "false" || !s.invoiceLines)));
  });
  r.get("/system-charge-codes/:code", c => {
    const s = catalog.systemCodes[c.req.param("code")];
    if (!s) throw notFound("Charge code");
    return c.json({ code: c.req.param("code"), ...s });
  });

  r.get("/charge-code-gaps", c => {
    const kind = c.req.query("kind");
    return c.json(catalogGaps(catalog).filter(g => !kind || g.kind === kind));
  });
  r.get("/charge-code-maps", c => {
    const { chargeId, code } = c.req.query();
    return c.json(mapRules().filter(x => (!chargeId || x.chargeId === chargeId) && (!code || x.code === code || x.initialCode === code)));
  });
  r.get("/charge-code-maps/:id", c => {
    const rule = mapRules().find(x => x.id === c.req.param("id"));
    if (!rule) throw notFound("Rule");
    return c.json(rule);
  });
  r.post("/charge-code-maps", notYet);
  r.put("/charge-code-maps/:id", notYet);
  r.delete("/charge-code-maps/:id", notYet);
  return r;
}
