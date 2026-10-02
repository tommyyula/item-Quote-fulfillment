// Guided quote: a few plain-language questions for someone quoting once, turned into charge selections.
// Pure functions over the answers, so which steps / options show and what gets quoted are unit-tested.
import { emptySel } from "./engine";
import type { Catalog, ChargeSel, SimpleCharge } from "./types";

export type Channel = "" | "B2B" | "D2C" | "Both";
export type Arrival = "floor" | "pallet" | "parcel";
export type StorageKind = "pallet" | "bin" | "each" | "sqft";
export type PickKind = "pallet" | "case" | "each";
export type Temperature = "dry" | "cooler" | "both";

export interface WizardAnswers {
  company: string; contact: string; email: string; phone: string;
  channel: Channel;
  facility: string;              // "" = not decided yet
  temperature: Temperature;
  arrival: Arrival[];
  storage: StorageKind[];
  b2bShip: string[];             // OB shipMethod values: Truckload, LTL, Small parcel, Will call
  retailers: string[];           // Amazon, Walmart, Costco, Target, Other
  platforms: string[];           // Shopify, Amazon, Walmart, Other (D2C web stores)
  pick: PickKind[];
  returns: boolean | null;
  extras: string[];              // value-added charge ids
  touched: string[];             // steps the user has answered; untouched steps take the suggestions
}

export function emptyAnswers(): WizardAnswers {
  return { company: "", contact: "", email: "", phone: "", channel: "", facility: "", temperature: "dry", arrival: [], storage: [],
           b2bShip: [], retailers: [], platforms: [], pick: [], returns: null, extras: [], touched: [] };
}

export type StepId = "company" | "channel" | "site" | "inbound" | "storage" | "b2b" | "d2c" | "pick" | "returns" | "extras" | "review";

export const b2b = (a: WizardAnswers) => a.channel === "B2B" || a.channel === "Both";
export const d2c = (a: WizardAnswers) => a.channel === "D2C" || a.channel === "Both";

/** Steps shown for these answers: the B2B / D2C order questions only appear for that kind of business. */
export function visibleSteps(a: WizardAnswers): StepId[] {
  const steps: StepId[] = ["company", "channel", "site", "inbound", "storage"];
  if (b2b(a)) steps.push("b2b");
  if (d2c(a)) steps.push("d2c");
  steps.push("pick", "returns", "extras", "review");
  return steps;
}

/** Whether Next is allowed on a step. The public page also needs an e-mail to send the quote to. */
export function stepComplete(step: StepId, a: WizardAnswers, needEmail = false): boolean {
  switch (step) {
    case "company": return a.company.trim() !== "" && (!needEmail || EMAIL_RE.test(a.email.trim()));
    case "channel": return a.channel !== "";
    case "inbound": return a.arrival.length > 0;
    case "storage": return a.storage.length > 0;
    case "b2b": return a.b2bShip.length > 0;
    case "pick": return a.pick.length > 0;
    case "returns": return a.returns !== null;
    default: return true;
  }
}

export const B2B_SHIP = ["Truckload", "LTL", "Small parcel", "Will call"];
export const RETAILERS = ["Amazon", "Walmart", "Costco", "Target", "Other"];
export const PLATFORMS = ["Shopify", "Amazon", "Walmart", "Other"];

export const sellsOnAmazon = (a: WizardAnswers) =>
  (b2b(a) && a.retailers.includes("Amazon")) || (d2c(a) && a.platforms.includes("Amazon"));
/** Anything leaves as a parcel: every D2C order, or B2B orders shipped small parcel. */
export const shipsParcel = (a: WizardAnswers) => d2c(a) || (b2b(a) && a.b2bShip.includes("Small parcel"));
/** Anything leaves on pallets (truckload / LTL to retailers and distributors). */
export const shipsPallets = (a: WizardAnswers) => b2b(a) && a.b2bShip.some(s => s === "Truckload" || s === "LTL");

/** Storage choices suggested from how goods arrive and who they are sold to. */
export function suggestedStorage(a: WizardAnswers): StorageKind[] {
  const out = new Set<StorageKind>();
  if (a.arrival.includes("pallet") || (a.arrival.includes("floor") && b2b(a))) out.add("pallet");
  if (d2c(a) || a.arrival.includes("parcel")) out.add("bin");
  if (!out.size) out.add("pallet");
  return [...out];
}

/** Full-pallet picking only exists for B2B orders. */
export function pickOptions(a: WizardAnswers): PickKind[] {
  return b2b(a) ? ["pallet", "case", "each"] : ["case", "each"];
}
export function suggestedPick(a: WizardAnswers): PickKind[] {
  const out: PickKind[] = [];
  if (shipsPallets(a)) out.push("pallet");
  if (b2b(a)) out.push("case");
  if (d2c(a)) out.push("each");
  return out;
}

/** Value-added services that fit the business (channel), with the ones the answers point to marked as recommended. */
export function extraOptions(cat: Catalog, a: WizardAnswers): { charge: SimpleCharge; recommended: boolean }[] {
  const vas = cat.categories.find(c => c.id === "vas")!.charges as SimpleCharge[];
  const fits = (ch: SimpleCharge) => ch.channel === "Both" || (ch.channel === "B2B" && b2b(a)) || (ch.channel === "D2C" && d2c(a));
  const rec = suggestedExtras(a);
  return vas.filter(ch => ch.tier === "main" && fits(ch)).map(charge => ({ charge, recommended: rec.includes(charge.id) }));
}
export function suggestedExtras(a: WizardAnswers): string[] {
  const out: string[] = [];
  if (sellsOnAmazon(a)) out.push("VA-FNSKU");
  if (d2c(a)) out.push("VA-PACKSLIP");
  return out;
}

/** Defaults applied when a step is first opened, from the answers before it. */
export function prefill(step: StepId, a: WizardAnswers): Partial<WizardAnswers> {
  switch (step) {
    case "storage": return { storage: suggestedStorage(a) };
    case "b2b": return { b2bShip: ["LTL"] };
    case "pick": return { pick: suggestedPick(a) };
    case "extras": return { extras: suggestedExtras(a) };
    default: return {};
  }
}

const on = (): ChargeSel => ({ ...emptySel(), on: true });

/** The quote the answers describe: which charges, factors and units, priced at the benchmark rates. */
export function wizardSelections(a: WizardAnswers): Record<string, ChargeSel> {
  const s: Record<string, ChargeSel> = {};
  const isB2B = b2b(a), isD2C = d2c(a);
  const channels = [isB2B && "B2B", isD2C && "D2C"].filter(Boolean) as string[];

  // setup
  s["SU-SETUP"] = on();
  s["SU-WMS"] = on();
  s["SU-SKU"] = on();
  if (isB2B && a.retailers.length) s["SU-EDI"] = on();
  if (isD2C && a.platforms.length) s["SU-ECOM"] = on();

  // inbound: the offload type only becomes a rate factor when containers and pallets both arrive
  const off = on();
  const floor = a.arrival.includes("floor"), pallet = a.arrival.includes("pallet"), parcel = a.arrival.includes("parcel");
  if (floor && pallet) off.conds.offloadType = { on: true, values: ["Floor loaded", "Palletized"] };
  if (floor) off.units.container = { on: true, driver: "caseCount" };
  if (pallet) off.units.pallet = { on: true, min: "load" };
  if (parcel || (floor && !pallet)) off.units.case = { on: true };
  s["IN-OFFLOAD"] = off;
  const put = on();
  if (pallet || floor) put.units.pallet = { on: true };
  if (parcel) put.units.case = { on: true };
  s["IN-PUTAWAY"] = put;

  // storage
  const st = on();
  if (a.temperature === "cooler") st.conds.temperature = { on: true, values: ["Cooler"] };
  if (a.temperature === "both") st.conds.temperature = { on: true, values: ["Dry / ambient", "Cooler"] };
  for (const k of a.storage) st.units[k] = k === "bin" ? { on: true, driver: "binSize" } : { on: true };
  s["ST-STORAGE"] = st;

  // outbound
  const businessType = { on: true, values: channels };
  const order = on();
  order.conds.businessType = businessType;
  order.units.order = { on: true };
  s["OB-ORDER"] = order;
  const pick = on();
  pick.conds.businessType = { ...businessType, values: [...channels] };
  for (const k of a.pick) if (k !== "pallet" || isB2B) pick.units[k] = { on: true };
  s["OB-PICK"] = pick;
  if (isD2C) {
    const pack = on();
    pack.units.order = { on: true };
    s["OB-PACK"] = pack;
  }
  if (shipsParcel(a)) s["OB-LABEL"] = on();
  if (isB2B && a.retailers.some(r => r !== "Other")) s["OB-ROUTING"] = on();
  if (shipsPallets(a)) {
    s["OB-PALLETBUILD"] = on();
    s["OT-PALLET-A"] = on();
    s["OT-WRAP"] = on();
  }

  // returns
  if (a.returns) {
    const rt = on();
    const types = [isD2C && "Consumer return (D2C)", isB2B && "Retailer return (B2B)"].filter(Boolean) as string[];
    rt.conds.returnType = { on: true, values: types };
    if (isD2C) rt.units.package = { on: true };
    rt.units.each = { on: true };
    if (isB2B) rt.units.case = { on: true };
    s["RT-RETURN"] = rt;
  }

  // value-added services and the everyday extras every account needs
  for (const id of a.extras) s[id] = on();
  for (const id of ["OT-LABOR", "OT-COUNT", "OT-RUSH", "OT-SUPPLIES"]) s[id] = on();
  if (shipsParcel(a)) s["OT-FREIGHT"] = on();
  return s;
}

// ---------------------------------------------------------------- public submissions (validated on the server)
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CHANNELS = ["B2B", "D2C", "Both"];
const ARRIVALS: Arrival[] = ["floor", "pallet", "parcel"];
const STORAGE: StorageKind[] = ["pallet", "bin", "each", "sqft"];
const PICKS: PickKind[] = ["pallet", "case", "each"];
const TEMPS: Temperature[] = ["dry", "cooler", "both"];

/** Answers from an untrusted client, reduced to known values; errors for what a quote cannot be built without. */
export function cleanAnswers(cat: Catalog, raw: unknown): { answers: WizardAnswers; errors: { path: string; message: string }[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (k: string, max = 200) => (typeof r[k] === "string" ? (r[k] as string).trim().slice(0, max) : "");
  const pick = <T extends string>(k: string, allowed: readonly T[]): T[] =>
    Array.isArray(r[k]) ? [...new Set((r[k] as unknown[]).filter((x): x is T => allowed.includes(x as T)))] : [];
  const facilities = (cat.categories[1].charges[0] as { conds: { id: string; values: string[] }[] }).conds.find(c => c.id === "facility")!.values;
  const extras = extraOptions(cat, { ...emptyAnswers(), channel: CHANNELS.includes(str("channel")) ? (str("channel") as Channel) : "Both" })
    .map(x => x.charge.id);
  const answers: WizardAnswers = {
    company: str("company"), contact: str("contact"), email: str("email"), phone: str("phone", 50),
    channel: CHANNELS.includes(str("channel")) ? (str("channel") as Channel) : "",
    facility: facilities.includes(str("facility")) ? str("facility") : "",
    temperature: TEMPS.includes(str("temperature") as Temperature) ? (str("temperature") as Temperature) : "dry",
    arrival: pick("arrival", ARRIVALS), storage: pick("storage", STORAGE), b2bShip: pick("b2bShip", B2B_SHIP),
    retailers: pick("retailers", RETAILERS), platforms: pick("platforms", PLATFORMS), pick: pick("pick", PICKS),
    returns: r.returns === true, extras: pick("extras", extras), touched: [],
  };
  const errors: { path: string; message: string }[] = [];
  if (!answers.company) errors.push({ path: "company", message: "required" });
  if (!EMAIL_RE.test(answers.email)) errors.push({ path: "email", message: "a valid e-mail address is required" });
  if (!answers.channel) errors.push({ path: "channel", message: `one of ${CHANNELS.join(", ")}` });
  return { answers, errors };
}
