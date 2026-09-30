// Lightweight i18n: UI messages + catalog translations, callable for any language
// (the proposal can be rendered in a different language than the UI).
import { MESSAGES } from "./messages";

export const LANGS = [
  { id: "en", label: "EN", locale: "en-US" },
  { id: "zh", label: "中文", locale: "zh-CN" },
  { id: "ja", label: "日本語", locale: "ja-JP" },
  { id: "es", label: "ES", locale: "es-US" },
] as const;
export type Lang = (typeof LANGS)[number]["id"];

const catalogFiles = import.meta.glob<Record<string, string>>("./catalog.*.json", { eager: true, import: "default" });
const CATALOG: Record<string, Record<string, string>> = {};
for (const [path, dict] of Object.entries(catalogFiles)) CATALOG[path.split(".")[2]] = dict;

export interface Translator {
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  tc: (en: string | undefined | null) => string;
  locale: string;
}

export function translator(lang: Lang): Translator {
  const ui = MESSAGES[lang] ?? MESSAGES.en;
  const cat = CATALOG[lang] ?? {};
  return {
    lang,
    locale: LANGS.find(l => l.id === lang)?.locale ?? "en-US",
    t: (key, params) => {
      let s = ui[key] ?? MESSAGES.en[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    tc: en => (en ? (lang === "en" ? en : cat[en] ?? en) : ""),
  };
}
