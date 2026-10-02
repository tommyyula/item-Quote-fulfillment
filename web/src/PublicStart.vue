<script setup lang="ts">
// Public guided quote (/start, no sign-in): the wizard, then the request is sent to sales and the visitor gets
// a rate sheet at standard rates to print. Without an API (GitHub Pages demo) the rate sheet is only built in the browser.
import { ref, watchEffect } from "vue";
import ProposalView from "./components/ProposalView.vue";
import ThemeToggle from "./components/ThemeToggle.vue";
import Wizard from "./components/Wizard.vue";
import { LANGS, type Lang } from "./i18n";
import { provideApp } from "./lib/context";
import { api, ApiError, serverMode } from "./lib/remote";
import { createStore, localRepo, type Repo } from "./lib/store";
import type { Customer, QuoteData } from "./lib/types";
import { wizardSelections, type WizardAnswers } from "./lib/wizard";

// the visitor's language / theme persist; everything else lives only in this page
const mem: Record<string, unknown> = {};
const repo: Repo = {
  load: (k, fallback) => (k === "prefs" ? localRepo.load(k, fallback) : k in mem ? (mem[k] as typeof fallback) : fallback),
  save: (k, v) => (k === "prefs" ? localRepo.save(k, v) : (mem[k] = v)),
};
const store = createStore(repo);
const { T } = provideApp(store);
const st = store.state;
const qs = new URLSearchParams(location.search);
if (LANGS.some(l => l.id === qs.get("lang"))) st.prefs.lang = qs.get("lang") as Lang;
watchEffect(() => {
  document.documentElement.dataset.theme = st.prefs.theme;
  document.documentElement.lang = st.prefs.lang;
  document.title = `UNIS ${T.value.t("w.start")}`;
});

const busy = ref(false);
const error = ref("");
const done = ref<{ number: string; email: string; sent: boolean } | null>(null);

async function submit(a: WizardAnswers) {
  busy.value = true;
  error.value = "";
  try {
    let number = "", draft: QuoteData | null = null, customer: Partial<Customer> = { company: a.company, contact: a.contact, email: a.email, phone: a.phone };
    if (serverMode) {
      const r = await api<{ number: string; customer: Customer; draft: QuoteData }>("POST", "/public/quote-requests", { answers: a });
      ({ number, draft, customer } = r.data);
    }
    // show the rate sheet through the same store + component as the app
    const { id: _id, createdAt: _c, ...fields } = customer;
    const cu = store.saveCustomer({ ...fields, company: fields.company ?? a.company });
    const q = store.createQuote(cu.id);
    if (number) q.number = number;
    if (draft) q.draft = draft;
    else {
      q.draft.header.title = T.value.t("w.title", { company: cu.company });
      q.draft.header.facility = a.facility;
      q.draft.selections = wizardSelections(a);
    }
    localRepo.save("wizard", null);
    done.value = { number: q.number, email: a.email, sent: serverMode };
    window.scrollTo(0, 0);
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 429 ? T.value.t("w.tooMany") : T.value.t("w.sendError");
  } finally {
    busy.value = false;
  }
}
const restart = () => location.reload();
const setLang = (l: Lang) => (st.prefs.lang = l);
const toggleTheme = () => (st.prefs.theme = st.prefs.theme === "light" ? "dark" : "light");
</script>

<template>
  <Wizard v-if="!done" is-public :busy="busy" :error="error" @submit="submit" />
  <div v-else class="pub">
    <header class="wtop no-print">
      <div class="brand"><span class="org">{{ T.t("app.brand") }}</span><strong>{{ T.t("w.start") }}</strong></div>
      <span class="sp"></span>
      <div class="seg" role="group" aria-label="Language">
        <button v-for="l in LANGS" :key="l.id" :class="{ on: st.prefs.lang === l.id }" :aria-pressed="st.prefs.lang === l.id" @click="setLang(l.id)">{{ l.label }}</button>
      </div>
      <ThemeToggle :theme="st.prefs.theme" :label="st.prefs.theme === 'light' ? T.t('h.nightView') : T.t('h.dayView')" @toggle="toggleTheme" />
    </header>
    <main id="main" class="stage">
      <section class="thanks no-print" role="status">
        <h2>{{ T.t("w.thanks.title") }}</h2>
        <p v-if="done.sent">{{ T.t("w.thanks.sent", { q: done.number, email: done.email }) }}</p>
        <p>{{ T.t("w.thanks.estimate") }}</p>
        <button class="btn" @click="restart">{{ T.t("w.startOver") }}</button>
      </section>
      <ProposalView is-public />
    </main>
  </div>
</template>

<style scoped>
.wtop { display: flex; align-items: center; gap: 10px; padding: 10px 20px; background: var(--sidebar); border-bottom: 1px solid var(--border); }
.brand { display: flex; flex-direction: column; line-height: 1.15; }
.brand .org { font-size: 12px; color: var(--muted-fg); }
.brand strong { font-size: 17px; }
.sp { flex: 1; }
.stage { width: min(1060px, 100%); margin: 0 auto; padding: 28px 16px 60px; }
.thanks { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px 26px; }
.thanks h2 { margin: 0 0 6px; font-size: 22px; }
.thanks p { margin: 0 0 10px; color: var(--muted-fg); max-width: 70ch; }
@media print { .stage { padding: 0; } }
</style>
