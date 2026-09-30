// App state: customers, quotes (draft + immutable versions), browsing history and preferences.
// Persisted through a small repository so localStorage can later be swapped for an API.
import { computed, reactive, watch } from "vue";
import catalogJson from "../data/catalog.json";
import { emptySel, quoteLines } from "./engine";
import type { Lang } from "../i18n";
import type { Catalog, ChargeSel, Customer, HistoryEvent, HistoryType, Quote, QuoteData, QuoteStatus } from "./types";

export const catalog = catalogJson as unknown as Catalog;

export interface Repo {
  load<T>(key: string, fallback: T): T;
  save<T>(key: string, value: T): void;
}
export const localRepo: Repo = {
  load(key, fallback) {
    try {
      const raw = localStorage.getItem(`unis-quote.${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  save(key, value) {
    try {
      localStorage.setItem(`unis-quote.${key}`, JSON.stringify(value));
    } catch {
      /* storage full / blocked - app keeps working in memory */
    }
  },
};

export interface Prefs { lang: Lang; theme: "light" | "dark"; showAll: boolean; proposalLang: Lang | ""; channel: "All" | "B2B" | "D2C" }

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function newQuoteData(facility = ""): QuoteData {
  return { header: { title: "", facility, effectiveDate: today(), validDays: 90, preparedBy: "", notes: "" }, selections: {} };
}

function seed(): { customers: Customer[]; quotes: Quote[] } {
  const c1: Customer = { id: uid(), code: "SAMPLE01", company: "Sample Retail Co.", contact: "Alex Chen", phone: "(555) 010-2000",
    email: "alex@sample-retail.example", address: "100 Commerce Way", city: "Ontario", state: "CA", zip: "91761", channel: "Both", createdAt: now() };
  const c2: Customer = { id: uid(), code: "SAMPLE02", company: "Acme Direct (D2C)", contact: "Maria Lopez", phone: "(555) 010-3000",
    email: "maria@acme-direct.example", address: "22 Market St", city: "Dallas", state: "TX", zip: "75201", channel: "D2C", createdAt: now() };
  const data = newQuoteData("Buena Park, CA");
  data.header.title = "Container receiving & B2B fulfillment";
  const off: ChargeSel = { ...emptySel(), on: true };
  off.conds.offloadType = { on: true, values: ["Floor loaded"] };
  off.units.container = { on: true, driver: "caseCount" };
  const ord: ChargeSel = { ...emptySel(), on: true };
  ord.conds.businessType = { on: true, values: ["B2B", "D2C"] };
  ord.conds.shipMethod = { on: true, values: ["Truckload", "LTL", "Small parcel"] };
  ord.units.order = { on: true };
  data.selections = { "IN-OFFLOAD": off, "IN-PUTAWAY": { ...emptySel(), on: true, units: { pallet: { on: true } } }, "OB-ORDER": ord,
    "OT-RUSH": { ...emptySel(), on: true }, "OT-LABOR": { ...emptySel(), on: true }, "OT-COUNT": { ...emptySel(), on: true } };
  const q: Quote = { id: uid(), number: `Q-${new Date().getFullYear()}-0001`, customerId: c1.id, createdAt: now(), updatedAt: now(),
    status: "draft", draft: data, versions: [] };
  return { customers: [c1, c2], quotes: [q] };
}

function initialLang(): Lang {
  const n = (navigator.language || "en").slice(0, 2);
  return (["en", "zh", "ja", "es"].includes(n) ? n : "en") as Lang;
}

export function createStore(repo: Repo = localRepo) {
  const seeded = repo.load<Quote[] | null>("quotes", null) === null ? seed() : null;
  const state = reactive({
    customers: repo.load<Customer[]>("customers", seeded?.customers ?? []),
    quotes: repo.load<Quote[]>("quotes", seeded?.quotes ?? []),
    history: repo.load<HistoryEvent[]>("history", []),
    prefs: repo.load<Prefs>("prefs", {
      lang: initialLang(),
      theme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      showAll: false, proposalLang: "", channel: "All",
    }),
    currentQuoteId: repo.load<string | null>("current", null) as string | null,
    viewingVersion: null as number | null,
    lastSaved: "" as string,
  });
  if (!state.currentQuoteId && state.quotes[0]) state.currentQuoteId = state.quotes[0].id;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    repo.save("customers", state.customers);
    repo.save("quotes", state.quotes);
    repo.save("history", state.history.slice(0, 500));
    repo.save("prefs", state.prefs);
    repo.save("current", state.currentQuoteId);
    state.lastSaved = now();
  };
  watch(() => [state.customers, state.quotes, state.history, state.prefs, state.currentQuoteId], () => {
    clearTimeout(timer);
    timer = setTimeout(persist, 400);
  }, { deep: true });

  const quote = computed(() => state.quotes.find(q => q.id === state.currentQuoteId) ?? null);
  const customer = computed(() => state.customers.find(c => c.id === quote.value?.customerId) ?? null);
  const readOnly = computed(() => state.viewingVersion != null);
  const data = computed<QuoteData | null>(() => {
    const q = quote.value;
    if (!q) return null;
    if (state.viewingVersion != null) return q.versions.find(v => v.v === state.viewingVersion)?.data ?? q.draft;
    return q.draft;
  });
  const latestVersion = computed(() => quote.value?.versions.at(-1) ?? null);
  const dirty = computed(() => {
    const q = quote.value;
    if (!q) return false;
    const last = q.versions.at(-1);
    return !last || JSON.stringify(last.data) !== JSON.stringify(q.draft);
  });

  function log(type: HistoryType, extra: Partial<HistoryEvent> = {}) {
    state.history.unshift({ id: uid(), ts: now(), type, quoteId: quote.value?.id, customerId: quote.value?.customerId, ...extra });
  }

  /** Selection for editing: created on first interaction so merely rendering never marks the draft dirty. */
  function sel(chargeId: string): ChargeSel {
    const d = quote.value!.draft;
    if (!d.selections[chargeId]) d.selections[chargeId] = emptySel();
    return d.selections[chargeId];
  }
  function touch() {
    if (quote.value) quote.value.updatedAt = now();
  }

  function nextNumber() {
    const y = new Date().getFullYear();
    const n = state.quotes.filter(q => q.number.startsWith(`Q-${y}-`)).map(q => +q.number.split("-")[2] || 0);
    return `Q-${y}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(4, "0")}`;
  }

  return {
    state, quote, customer, readOnly, data, latestVersion, dirty, sel, touch, log,
    openQuote(id: string) {
      state.currentQuoteId = id;
      state.viewingVersion = null;
      const q = quote.value;
      if (q) log("view", { quoteId: q.id, customerId: q.customerId });
    },
    createQuote(customerId: string) {
      const q: Quote = { id: uid(), number: nextNumber(), customerId, createdAt: now(), updatedAt: now(), status: "draft",
        draft: newQuoteData(), versions: [] };
      state.quotes.unshift(q);
      state.currentQuoteId = q.id;
      state.viewingVersion = null;
      log("create", { quoteId: q.id, customerId });
      return q;
    },
    saveCustomer(c: Partial<Customer> & { company: string }) {
      const existing = c.id && state.customers.find(x => x.id === c.id);
      if (existing) {
        Object.assign(existing, c);
        log("customer-edit", { customerId: existing.id, detail: existing.company, quoteId: undefined });
        return existing;
      }
      const created: Customer = { id: uid(), code: "", contact: "", phone: "", email: "", address: "", city: "", state: "", zip: "",
        channel: "Both", createdAt: now(), ...c } as Customer;
      state.customers.unshift(created);
      log("customer-create", { customerId: created.id, detail: created.company, quoteId: undefined });
      return created;
    },
    saveVersion(note: string) {
      const q = quote.value!;
      const v = (q.versions.at(-1)?.v ?? 0) + 1;
      q.versions.push({ v, savedAt: now(), note, data: clone(q.draft), lineCount: quoteLines(catalog, q.draft).length });
      log("save-version", { detail: `v${v}` });
      return v;
    },
    viewVersion(v: number | null) {
      state.viewingVersion = v;
    },
    restoreVersion(v: number) {
      const q = quote.value!;
      const ver = q.versions.find(x => x.v === v);
      if (!ver) return;
      q.draft = clone(ver.data);
      state.viewingVersion = null;
      touch();
      log("restore", { detail: `v${v}` });
    },
    setStatus(s: QuoteStatus) {
      quote.value!.status = s;
      log("status", { detail: s });
    },
  };
}

export type Store = ReturnType<typeof createStore>;
