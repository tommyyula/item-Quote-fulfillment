<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watchEffect } from "vue";
import ChargeCard from "./components/ChargeCard.vue";
import CustomersDrawer from "./components/CustomersDrawer.vue";
import HistoryDrawer from "./components/HistoryDrawer.vue";
import ProposalView from "./components/ProposalView.vue";
import VersionsDrawer from "./components/VersionsDrawer.vue";
import { LANGS, type Lang } from "./i18n";
import { provideApp } from "./lib/context";
import { catalog, createStore } from "./lib/store";
import type { Charge, QuoteStatus } from "./lib/types";

const store = createStore();
const { T } = provideApp(store);
const st = store.state;
const drawer = ref<"" | "customers" | "versions" | "history">("");
const saving = ref(false);
const note = ref("");
const search = ref("");
const detailsOpen = ref(false);

watchEffect(() => {
  document.documentElement.dataset.theme = st.prefs.theme;
  document.documentElement.lang = st.prefs.lang;
  document.title = `${store.quote.value?.number ?? ""} · UNIS ${T.value.t("app.title")}`;
});
if (store.quote.value) store.log("view");

// deep links: ?lang=zh&theme=dark&plang=en#proposal
const qs = new URLSearchParams(location.search);
if (LANGS.some(l => l.id === qs.get("lang"))) st.prefs.lang = qs.get("lang") as Lang;
if (qs.get("theme") === "dark" || qs.get("theme") === "light") st.prefs.theme = qs.get("theme") as "dark" | "light";
if (LANGS.some(l => l.id === qs.get("plang"))) st.prefs.proposalLang = qs.get("plang") as Lang;
const proposalOnly = ref(qs.get("view") === "proposal");
onMounted(() => { if (location.hash) nextTick(() => document.querySelector(location.hash)?.scrollIntoView()); });

const facilities = (catalog.categories[1].charges[0] as { conds: { id: string; values: string[] }[] }).conds.find(c => c.id === "facility")!.values;
const customerQuotes = computed(() => store.state.quotes.filter(q => q.customerId === store.customer.value?.id));
const statuses: QuoteStatus[] = ["draft", "sent", "accepted", "archived"];

// ---- entry filters
const matches = (c: Charge) => {
  const q = search.value.trim().toLowerCase();
  const chOk = st.prefs.channel === "All" || c.kind === "builder" || c.channel === "Both" || c.channel === st.prefs.channel;
  if (!chOk) return false;
  if (!q) return true;
  return [c.name, c.desc, T.value.tc(c.name), T.value.tc(c.desc)].some(x => x.toLowerCase().includes(q));
};
const cats = computed(() => catalog.categories.map(cat => {
  const shown = cat.charges.filter(matches);
  return { cat, main: shown.filter(c => c.tier === "main"), adv: shown.filter(c => c.tier !== "main"),
           selected: cat.charges.filter(c => store.data.value?.selections[c.id]?.on).length };
}));
const advOpen = ref<Record<string, boolean>>({});
const anyMatch = computed(() => cats.value.some(c => c.main.length || c.adv.length));
const selectedIn = (ids: Charge[]) => ids.filter(c => store.data.value?.selections[c.id]?.on).length;

function saveVersion() {
  const v = store.saveVersion(note.value.trim());
  note.value = "";
  saving.value = false;
  return v;
}
const setLang = (l: Lang) => (st.prefs.lang = l);
const h = computed(() => store.quote.value!.draft.header);
const touch = () => store.touch();
</script>

<template>
  <header class="top no-print">
    <div class="brand"><b>UNIS</b> <span>{{ T.t("app.title") }}</span></div>
    <button class="btn pick" @click="drawer = 'customers'" :title="T.t('h.selectCustomer')">
      <span class="lbl">{{ T.t("h.customer") }}</span>{{ store.customer.value?.company ?? T.t("h.selectCustomer") }} ▾
    </button>
    <template v-if="store.quote.value">
      <select class="input qsel" :value="store.quote.value.id" @change="store.openQuote(($event.target as HTMLSelectElement).value)" :aria-label="T.t('h.quote')">
        <option v-for="q in customerQuotes" :key="q.id" :value="q.id">{{ q.number }}{{ q.draft.header.title ? ` · ${q.draft.header.title}` : "" }}</option>
      </select>
      <button class="btn sm" @click="store.createQuote(store.customer.value!.id)">＋ {{ T.t("h.newQuote") }}</button>
      <select class="input" :value="store.quote.value.status" @change="store.setStatus(($event.target as HTMLSelectElement).value as QuoteStatus)" :aria-label="T.t('h.status')">
        <option v-for="s in statuses" :key="s" :value="s">{{ T.t(`status.${s}`) }}</option>
      </select>
      <span class="vstate">
        <span v-if="store.dirty.value" class="badge warn">{{ T.t("v.unsaved") }}</span>
        <span v-else class="badge ok">{{ T.t("v.upToDate", { n: store.latestVersion.value?.v ?? 0 }) }}</span>
      </span>
      <button class="btn primary sm" :disabled="!store.dirty.value || store.readOnly.value" @click="saving = true">{{ T.t("h.saveVersion") }}</button>
      <button class="btn sm" @click="drawer = 'versions'">⎇ {{ T.t("h.versions") }} ({{ store.quote.value.versions.length }})</button>
    </template>
    <button class="btn sm" @click="drawer = 'history'">🕘 {{ T.t("h.history") }}</button>
    <span class="sp"></span>
    <div class="seg" role="group" aria-label="language">
      <button v-for="l in LANGS" :key="l.id" :class="{ on: st.prefs.lang === l.id }" @click="setLang(l.id)">{{ l.label }}</button>
    </div>
    <button class="btn sm" @click="st.prefs.theme = st.prefs.theme === 'dark' ? 'light' : 'dark'">
      {{ st.prefs.theme === "dark" ? `☀ ${T.t("h.day")}` : `☾ ${T.t("h.night")}` }}
    </button>
  </header>

  <div v-if="store.readOnly.value" class="banner no-print">
    {{ T.t("e.readOnly", { v: st.viewingVersion! }) }}
    <button class="btn sm" @click="store.viewVersion(null)">{{ T.t("e.backToDraft") }}</button>
    <button class="btn sm primary" @click="store.restoreVersion(st.viewingVersion!)">{{ T.t("e.restoreDraft") }}</button>
  </div>

  <div v-if="!store.quote.value" class="empty no-print">
    <p>{{ T.t("h.noQuote") }}</p>
    <button class="btn primary" @click="drawer = 'customers'">{{ T.t("h.selectCustomer") }}</button>
  </div>

  <div v-else class="layout" :class="{ solo: proposalOnly }">
    <nav v-if="!proposalOnly" class="side no-print">
      <a v-for="c in cats" :key="c.cat.id" :href="`#cat-${c.cat.id}`">
        <span>{{ T.tc(c.cat.name) }}</span><span v-if="c.selected" class="cnt">{{ c.selected }}</span>
      </a>
      <a href="#proposal" class="prop">{{ T.t("p.toolbar") }} →</a>
    </nav>

    <main>
      <template v-if="!proposalOnly">
      <section class="details no-print">
        <button class="dhead" @click="detailsOpen = !detailsOpen">
          <b>{{ T.t("q.details") }}</b>
          <span class="muted">{{ store.quote.value.number }} · {{ h.facility ? T.tc(h.facility) : T.t("q.allFacilities") }} · {{ h.effectiveDate }} · {{ h.validDays }}d</span>
          <span class="sp"></span>{{ detailsOpen ? "▴" : "▾" }}
        </button>
        <div v-if="detailsOpen" class="dgrid">
          <label class="wide"><span>{{ T.t("q.title") }}</span><input class="input" v-model="h.title" :readonly="store.readOnly.value" @input="touch" /></label>
          <label><span>{{ T.t("q.facility") }}</span>
            <select class="input" v-model="h.facility" :disabled="store.readOnly.value" @change="touch">
              <option value="">{{ T.t("q.allFacilities") }}</option>
              <option v-for="f in facilities" :key="f" :value="f">{{ T.tc(f) }}</option>
            </select>
          </label>
          <label><span>{{ T.t("q.effective") }}</span><input class="input" type="date" v-model="h.effectiveDate" :readonly="store.readOnly.value" @input="touch" /></label>
          <label><span>{{ T.t("q.validDays") }}</span><input class="input" type="number" min="1" v-model.number="h.validDays" :readonly="store.readOnly.value" @input="touch" /></label>
          <label><span>{{ T.t("q.preparedBy") }}</span><input class="input" v-model="h.preparedBy" :readonly="store.readOnly.value" @input="touch" /></label>
          <label class="wide"><span>{{ T.t("q.notes") }}</span><textarea class="input" rows="2" v-model="h.notes" :readonly="store.readOnly.value" @input="touch"></textarea></label>
        </div>
      </section>

      <div class="filters no-print">
        <input class="input search" v-model="search" :placeholder="T.t('e.search')" />
        <div class="chips">
          <button v-for="ch in (['All', 'B2B', 'D2C'] as const)" :key="ch" class="chip sm" :class="{ sel: st.prefs.channel === ch }" @click="st.prefs.channel = ch">
            {{ ch === "All" ? T.t("e.channelAll") : ch }}
          </button>
        </div>
        <span class="sp"></span>
        <label class="switch"><input type="checkbox" v-model="st.prefs.showAll" /><span class="track"></span>{{ T.t("h.showAll") }}</label>
      </div>
      <p v-if="!anyMatch" class="muted no-print">{{ T.t("e.noMatch") }}</p>

      <section v-for="c in cats" v-show="c.main.length || c.adv.length" :key="c.cat.id" :id="`cat-${c.cat.id}`" class="cat no-print">
        <h2>{{ T.tc(c.cat.name) }} <span v-if="c.selected" class="badge ok">{{ T.t("e.selected", { n: c.selected }) }}</span></h2>
        <p class="muted">{{ T.tc(c.cat.desc) }}</p>
        <ChargeCard v-for="ch in c.main" :key="ch.id" :charge="ch" />
        <details v-if="c.adv.length" class="adv" :open="advOpen[c.cat.id] || st.prefs.showAll || !!search || selectedIn(c.adv) > 0"
                 @toggle="advOpen[c.cat.id] = ($event.target as HTMLDetailsElement).open">
          <summary>{{ T.t("e.advanced", { n: c.adv.length }) }}<span v-if="selectedIn(c.adv)" class="hint"> · {{ T.t("e.selected", { n: selectedIn(c.adv) }) }}</span></summary>
          <ChargeCard v-for="ch in c.adv" :key="ch.id" :charge="ch" />
        </details>
      </section>

      </template>
      <ProposalView />
      <p class="hint no-print saved">{{ st.lastSaved ? T.t("v.autosaved") : "" }}</p>
    </main>
  </div>

  <CustomersDrawer v-if="drawer === 'customers'" @close="drawer = ''" />
  <VersionsDrawer v-if="drawer === 'versions' && store.quote.value" @close="drawer = ''" />
  <HistoryDrawer v-if="drawer === 'history'" @close="drawer = ''" />

  <div v-if="saving" class="modal no-print" @click.self="saving = false">
    <div class="dialog" role="dialog">
      <h3>{{ T.t("v.saveTitle", { n: (store.latestVersion.value?.v ?? 0) + 1 }) }}</h3>
      <textarea class="input" rows="3" v-model="note" :placeholder="T.t('v.notePh')" autofocus></textarea>
      <div class="acts"><button class="btn" @click="saving = false">{{ T.t("c.cancel") }}</button><button class="btn primary" @click="saveVersion">{{ T.t("c.save") }}</button></div>
    </div>
  </div>
</template>

<style scoped>
.top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 9px 18px;
  background: var(--brand); color: #fff; box-shadow: var(--shadow); }
.top .btn:not(.primary), .top .input { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.25); color: #fff; }
.top .input option { color: #000; }
.brand { font-size: 16px; margin-right: 6px; white-space: nowrap; }
.brand span { opacity: .8; }
.pick .lbl { font-size: 11px; opacity: .7; margin-right: 4px; }
.qsel { max-width: 280px; }
.vstate .badge { background: #fff; }
.sp { flex: 1; }
.seg { display: inline-flex; border: 1px solid rgba(255,255,255,.3); border-radius: 6px; overflow: hidden; }
.seg button { background: transparent; border: 0; color: #fff; padding: 4px 9px; cursor: pointer; font-size: 12.5px; }
.seg button.on { background: #fff; color: var(--brand); font-weight: 700; }
.banner { background: var(--warn-soft); color: var(--warn); padding: 8px 18px; display: flex; gap: 10px; align-items: center; border-bottom: 1px solid var(--line); }
.empty { text-align: center; padding: 80px 20px; }
.layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 20px; max-width: 1320px; margin: 0 auto; padding: 18px; }
.side { position: sticky; top: 70px; align-self: start; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 6px; }
.side a { display: flex; justify-content: space-between; padding: 7px 10px; border-radius: 6px; color: var(--ink); text-decoration: none; }
.side a:hover { background: var(--soft); }
.side .cnt { background: var(--brand-2); color: #fff; border-radius: 10px; font-size: 11px; padding: 0 7px; }
.side .prop { border-top: 1px solid var(--line); margin-top: 4px; color: var(--brand-2); font-weight: 600; }
.details { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); margin-bottom: 14px; }
.dhead { display: flex; gap: 10px; align-items: center; width: 100%; background: none; border: 0; padding: 10px 14px; cursor: pointer; text-align: left; flex-wrap: wrap; }
.dgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 0 14px 14px; }
.dgrid label { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: var(--muted); }
.dgrid .wide { grid-column: span 2; }
.filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; position: sticky; top: 52px; z-index: 5; background: var(--bg); padding: 6px 0; }
.search { width: 260px; }
.switch { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 13px; }
.switch input { display: none; }
.switch .track { width: 34px; height: 20px; border-radius: 10px; background: var(--line-2); position: relative; transition: .15s; }
.switch .track:after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: .15s; }
.switch input:checked + .track { background: var(--brand-2); }
.switch input:checked + .track:after { left: 16px; }
.cat { margin: 18px 0 26px; }
.cat h2 { font-size: 18px; margin: 0; display: flex; gap: 8px; align-items: center; }
.cat > p { margin: 2px 0 10px; }
.adv > summary { cursor: pointer; color: var(--brand-2); font-weight: 600; padding: 6px 2px; }
.saved { text-align: right; }
.modal { position: fixed; inset: 0; background: rgba(15,20,28,.4); z-index: 60; display: grid; place-items: center; }
.dialog { background: var(--panel); border-radius: var(--radius); padding: 18px; width: min(440px, 92vw); box-shadow: var(--shadow); }
.dialog h3 { margin: 0 0 10px; }
.dialog textarea { width: 100%; }
.dialog .acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .side { position: static; display: flex; flex-wrap: wrap; } .dgrid { grid-template-columns: 1fr 1fr; } .filters { top: 0; } }
.layout.solo { grid-template-columns: minmax(0, 1fr); max-width: 1060px; }
@media print { .layout { display: block; padding: 0; } }
</style>
