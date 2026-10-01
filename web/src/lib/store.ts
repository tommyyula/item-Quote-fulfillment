// App state: customers, quotes (draft + immutable versions), browsing history and preferences.
// Browser mode keeps everything in localStorage. Server mode (a Bootstrap from the API) keeps the same reactive state,
// and every change is written to the API in order (drafts debounced, with If-Match so concurrent editors never overwrite each other).
import { computed, reactive, watch } from "vue";
import catalogJson from "../data/catalog.json";
import { mapQuote, summarize } from "./codemap";
import { emptySel, quoteLines } from "./engine";
import type { Lang } from "../i18n";
import { api, ApiError, type Bootstrap, type User } from "./remote";
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

/** New quotes start from the default template (most common charges) unless `blank` is requested. */
export function newQuoteData(facility = "", blank = false): QuoteData {
  return { header: { title: "", facility, effectiveDate: today(), validDays: 90, preparedBy: "", notes: "" },
           selections: blank ? {} : clone(catalog.defaultPreset) };
}

function seed(): { customers: Customer[]; quotes: Quote[] } {
  const c1: Customer = { id: uid(), code: "SAMPLE01", company: "Sample Retail Co.", contact: "Alex Chen", phone: "(555) 010-2000",
    email: "alex@sample-retail.example", address: "100 Commerce Way", city: "Ontario", state: "CA", zip: "91761", channel: "Both", createdAt: now() };
  const c2: Customer = { id: uid(), code: "SAMPLE02", company: "Acme Direct (D2C)", contact: "Maria Lopez", phone: "(555) 010-3000",
    email: "maria@acme-direct.example", address: "22 Market St", city: "Dallas", state: "TX", zip: "75201", channel: "D2C", createdAt: now() };
  const data = newQuoteData("Buena Park, CA");
  data.header.title = "Standard warehousing and fulfillment";
  const q: Quote = { id: uid(), number: `Q-${new Date().getFullYear()}-0001`, customerId: c1.id, createdAt: now(), updatedAt: now(),
    status: "draft", draft: data, versions: [] };
  return { customers: [c1, c2], quotes: [q] };
}

function initialLang(): Lang {
  const n = (navigator.language || "en").slice(0, 2);
  return (["en", "zh", "ja", "es"].includes(n) ? n : "en") as Lang;
}

export type SyncState = "saved" | "saving" | "error" | "conflict";
const fromBoot = (b: Bootstrap) => ({
  customers: b.customers,
  quotes: b.quotes.map(({ etag: _e, ...q }) => q as unknown as Quote),
  history: b.history,
});

export function createStore(repo: Repo = localRepo, boot?: Bootstrap) {
  const seeded = !boot && repo.load<Quote[] | null>("quotes", null) === null ? seed() : null;
  const initial = boot ? fromBoot(boot) : null;
  const state = reactive({
    customers: initial?.customers ?? repo.load<Customer[]>("customers", seeded?.customers ?? []),
    quotes: initial?.quotes ?? repo.load<Quote[]>("quotes", seeded?.quotes ?? []),
    history: initial?.history ?? repo.load<HistoryEvent[]>("history", []),
    prefs: repo.load<Prefs>("prefs", {
      lang: initialLang(),
      theme: "dark", // ITEM web properties are dark by default
      showAll: false, proposalLang: "", channel: "All",
    }),
    currentQuoteId: repo.load<string | null>("current", null) as string | null,
    viewingVersion: null as number | null,
    lastSaved: "" as string,
    user: (boot?.user ?? null) as User | null,
    sync: "saved" as SyncState,
  });
  if (!boot) ensureStandardTemplate();   // the server seeds it in server mode
  if (!state.quotes.some(q => q.id === state.currentQuoteId)) state.currentQuoteId = state.quotes[0]?.id ?? null;
  const remote = boot ? createSync() : null;

  /** The "Standard Charge Template" customer + its quote (saved as v1) exist in every browser; never overwritten once present. */
  function ensureStandardTemplate() {
    const t = catalog.standardTemplate;
    const snapshot = (data: QuoteData, note: string, v: number) => {
      const lines = mapQuote(catalog, data);
      return { v, savedAt: now(), note, data: clone(data), lineCount: lines.length, mapping: { summary: summarize(lines), lines: clone(lines) } };
    };
    const existing = state.customers.find(c => c.code === t.customer.code);
    if (existing) {
      // upgrade an untouched older template in place as a new version (history kept); never touch a template someone edited
      const q = state.quotes.find(x => x.customerId === existing.id && x.number === "Q-STANDARD");
      const last = q?.versions.at(-1);
      if (q && last && q.templateVersion !== t.version && JSON.stringify(q.draft) === JSON.stringify(last.data)) {
        const data = clone(last.data);
        data.selections = clone(t.selections);
        data.header.notes = t.note;
        q.versions.push(snapshot(data, `${t.note} Updated template: ${t.version}.`, last.v + 1));
        q.draft = data;
        q.templateVersion = t.version;
        q.updatedAt = now();
      }
      return;
    }
    const cu: Customer = { id: uid(), code: t.customer.code, company: t.customer.company, contact: "", phone: "", email: "",
      address: "", city: "", state: "", zip: "", channel: t.customer.channel, createdAt: now() };
    const data = newQuoteData("", true);
    data.header.title = t.title;
    data.header.notes = t.note;
    data.selections = clone(t.selections);
    const q: Quote = { id: uid(), number: "Q-STANDARD", customerId: cu.id, createdAt: now(), updatedAt: now(), status: "draft", draft: data,
      versions: [snapshot(data, t.note, 1)], templateVersion: t.version };
    state.customers.unshift(cu);
    state.quotes.push(q);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    if (!remote) {
      repo.save("customers", state.customers);
      repo.save("quotes", state.quotes);
      repo.save("history", state.history.slice(0, 500));
    }
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
    const e: HistoryEvent = { id: uid(), ts: now(), type, quoteId: quote.value?.id, customerId: quote.value?.customerId, ...extra };
    state.history.unshift(e);
    // the server records its own actions (create, save-version, restore, status, customers); only client-side events are sent
    if (remote && (type === "view" || type === "export" || type === "print"))
      remote.enqueue(() => api("POST", "/v1/history", { id: e.id, type, quoteId: e.quoteId, customerId: e.customerId, detail: e.detail }));
  }

  /** Server sync: one ordered queue of writes; drafts are saved 700 ms after the last edit. */
  function createSync() {
    const etags = new Map<string, string>();
    const synced = new Map<string, string>();   // quote id -> draft JSON the server has
    const remember = (b: Bootstrap) => {
      etags.clear(); synced.clear();
      for (const q of b.quotes) { etags.set(q.id, q.etag); synced.set(q.id, JSON.stringify(q.draft)); }
    };
    remember(boot!);
    let chain: Promise<unknown> = Promise.resolve();
    let pending = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function reload() {
      const b = (await api<Bootstrap>("GET", "/v1/app/bootstrap")).data;
      const next = fromBoot(b);
      state.customers = next.customers;
      state.quotes = next.quotes;
      state.history = next.history;
      remember(b);
      if (!state.quotes.some(q => q.id === state.currentQuoteId)) state.currentQuoteId = state.quotes[0]?.id ?? null;
    }
    function enqueue(job: () => Promise<unknown>) {
      pending++;
      state.sync = "saving";
      chain = chain.then(job).then(
        () => { if (--pending === 0 && state.sync === "saving") state.sync = "saved"; },
        async (e: unknown) => {
          pending--;
          console.error("sync failed", e);
          if (e instanceof ApiError && e.status === 412) {
            state.sync = "conflict";
            await reload().catch(() => (state.sync = "error"));
          } else if (e instanceof ApiError && e.status === 401) {
            location.reload();   // session expired: sign in again (drafts not yet saved are kept by the retry below until then)
          } else {
            state.sync = "error";
            clearTimeout(retry);
            retry = setTimeout(saveDrafts, 5000);
          }
        });
      return chain;
    }
    function saveDraft(id: string, keepalive = false) {
      return enqueue(async () => {
        const q = state.quotes.find(x => x.id === id);
        if (!q) return;
        const json = JSON.stringify(q.draft);
        if (json === synced.get(id)) return;
        const r = await api("PUT", `/v1/quotes/${id}/draft`, JSON.parse(json), etags.has(id) ? { "if-match": etags.get(id)! } : {}, keepalive);
        if (r.etag) etags.set(id, r.etag);
        synced.set(id, json);
      });
    }
    function saveDrafts(keepalive = false) {
      for (const q of state.quotes) if (JSON.stringify(q.draft) !== synced.get(q.id)) saveDraft(q.id, keepalive);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(() => state.quotes.map(q => JSON.stringify(q.draft)), () => {
      clearTimeout(timer);
      timer = setTimeout(saveDrafts, 700);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") { clearTimeout(timer); saveDrafts(true); }
    });
    const tagged = (id: string): Record<string, string> => (etags.has(id) ? { "if-match": etags.get(id)! } : {});
    return {
      enqueue, saveDraft, reload,
      afterWrite(id: string, etag: string | null, draftJson?: string) {
        if (etag) etags.set(id, etag);
        if (draftJson !== undefined) synced.set(id, draftJson);
      },
      tagged,
    };
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
      remote?.enqueue(async () => {
        const r = await api<Quote>("POST", "/v1/quotes", { id: q.id, customerId, header: q.draft.header });
        const local = state.quotes.find(x => x.id === q.id);
        if (local) { local.number = r.data.number; local.createdAt = r.data.createdAt; }
        remote.afterWrite(q.id, r.etag, JSON.stringify(r.data.draft));
      });
      return q;
    },
    saveCustomer(c: Partial<Customer> & { company: string }) {
      const existing = c.id && state.customers.find(x => x.id === c.id);
      if (existing) {
        Object.assign(existing, c);
        log("customer-edit", { customerId: existing.id, detail: existing.company, quoteId: undefined });
        const { id, createdAt: _c, ...fields } = existing as Customer & { updatedAt?: string };
        delete (fields as { updatedAt?: string }).updatedAt;
        remote?.enqueue(() => api("PATCH", `/v1/customers/${id}`, fields));
        return existing;
      }
      const created: Customer = { id: uid(), code: "", contact: "", phone: "", email: "", address: "", city: "", state: "", zip: "",
        channel: "Both", createdAt: now(), ...c } as Customer;
      state.customers.unshift(created);
      log("customer-create", { customerId: created.id, detail: created.company, quoteId: undefined });
      if (remote) {
        const { createdAt: _c, ...fields } = created;
        remote.enqueue(() => api("POST", "/v1/customers", fields));
      }
      return created;
    },
    saveVersion(note: string) {
      const q = quote.value!;
      const v = (q.versions.at(-1)?.v ?? 0) + 1;
      // snapshot the charge-code mapback with the version, so billing can be configured from exactly what was saved
      const lines = mapQuote(catalog, q.draft);
      const summary = summarize(lines);
      q.versions.push({ v, savedAt: now(), note, data: clone(q.draft), lineCount: quoteLines(catalog, q.draft).length,
                        mapping: { summary, lines: clone(lines) } });
      log("save-version", { detail: `v${v} (${summary.mapped}/${summary.total})` });
      if (remote) {
        remote.saveDraft(q.id);   // the server snapshots its draft, so it must be current first
        remote.enqueue(async () => {
          const r = await api<{ v: number; savedAt: string; savedBy?: string; lineCount: number; mapping: typeof summary }>(
            "POST", `/v1/quotes/${q.id}/versions`, { note });
          const local = q.versions.find(x => x.v === v);
          if (local) Object.assign(local, { v: r.data.v, savedAt: r.data.savedAt, lineCount: r.data.lineCount,
                                            mapping: { summary: r.data.mapping, lines: local.mapping?.lines ?? [] } });
        });
      }
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
      if (remote) {
        const json = JSON.stringify(q.draft);
        remote.saveDraft(q.id);   // flush edits made before the restore, so the server's draft matches what is restored over
        remote.enqueue(async () => remote.afterWrite(q.id, (await api("POST", `/v1/quotes/${q.id}/versions/${v}/restore`, undefined, {})).etag, json));
      }
    },
    /** Replace the draft's selections with the default template (header kept). */
    applyDefaultTemplate() {
      const q = quote.value!;
      q.draft.selections = clone(catalog.defaultPreset);
      touch();
    },
    setStatus(s: QuoteStatus) {
      const q = quote.value!;
      q.status = s;
      log("status", { detail: s });
      remote?.enqueue(async () => remote.afterWrite(q.id, (await api("PATCH", `/v1/quotes/${q.id}`, { status: s }, remote.tagged(q.id))).etag));
    },
  };
}

export type Store = ReturnType<typeof createStore>;
