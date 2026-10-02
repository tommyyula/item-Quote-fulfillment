import type { Translator } from "../i18n";
import type { Rate } from "./proposal";

// Currency is USD for every language; numbers use en-US grouping so rate sheets stay unambiguous.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "" : usd.format(x));
/** "Container" -> "container", but "SKU" / "EDI" stay; CJK untouched. */
export const softLower = (s: string) => s.replace(/^(\p{Lu})(?=\p{Ll})/u, c => c.toLowerCase());
export const pct = (x: number | null | undefined) => (x == null ? "" : `${Math.round(x * 10000) / 100}%`);
// percent charges re-billed on cost read as "markup on cost"; other percent bases ("% of card payment") keep their own unit
export const isMarkup = (unit: string | undefined) => !unit || unit === "% on cost";

export function rateText(r: Rate | undefined, T: Translator): string {
  if (!r) return "";
  if (r.kind === "pct") return r.p == null ? T.t("p.tbd") : pct(r.p);
  if (r.kind === "single") return r.p == null ? T.t("p.tbd") : money(r.p);
  return T.t("p.firstAdd", { first: r.first == null ? T.t("p.tbd") : money(r.first), add: r.add == null ? T.t("p.tbd") : money(r.add) });
}

export function unitText(unit: string | undefined, T: Translator, opts: { pct?: boolean; minBasis?: boolean } = {}): string {
  if (opts.pct) return isMarkup(unit) ? T.t("p.markup") : T.tc(unit);
  if (!unit) return "";
  if (opts.minBasis) return T.t("p.per", { unit: T.t(`basis.${unit}`) });
  if (/^one-time/i.test(unit)) return T.t("e.oneTime");
  // merged synonym rows carry "Order / Receipt" (no whole-phrase translation): translate and soften each part
  const whole = T.tc(unit);
  const text = T.lang !== "en" && whole !== unit ? whole : unit.split(" / ").map(u => softLower(T.tc(u))).join(" / ");
  return T.t("p.per", { unit: softLower(text) });
}

export function dateText(iso: string, T: Translator): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return new Intl.DateTimeFormat(T.locale, { year: "numeric", month: "short", day: "numeric" }).format(d);
}
export function dateTimeText(iso: string, T: Translator): string {
  return new Intl.DateTimeFormat(T.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + (days || 0));
  return d.toISOString().slice(0, 10);
}
