<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watchEffect } from "vue";
import itemLogoDark from "./assets/brand/item-white-logo.svg";
import itemLogoLight from "./assets/brand/item-logo-fullcolor-blacktxt.svg";
import ChargeCard from "./components/ChargeCard.vue";
import ChargeCodeMapping from "./components/ChargeCodeMapping.vue";
import Drawer from "./components/Drawer.vue";
import CustomersDrawer from "./components/CustomersDrawer.vue";
import HistoryDrawer from "./components/HistoryDrawer.vue";
import ProposalView from "./components/ProposalView.vue";
import ThemeToggle from "./components/ThemeToggle.vue";
import VersionsDrawer from "./components/VersionsDrawer.vue";
import { LANGS, type Lang } from "./i18n";
import { provideApp } from "./lib/context";
import { signOut } from "./lib/remote";
import { catalog, createStore, type Store } from "./lib/store";
import type { Charge, QuoteStatus } from "./lib/types";

// server mode passes a store built from the API bootstrap (main.ts); otherwise the browser-only store
const props = defineProps<{ store?: Store }>();
const store = props.store ?? createStore();
const { T } = provideApp(store);
const st = store.state;
const drawer = ref<"" | "customers" | "versions" | "history" | "mapping">("");
const saving = ref(false);
const note = ref("");
const search = ref("");
const detailsOpen = ref(false);
const confirmTemplate = ref(false);
const flash = ref("");

watchEffect(() => {
  document.documentElement.dataset.theme = st.prefs.theme;
  document.documentElement.lang = st.prefs.lang;
  document.title = `${store.quote.value?.number ?? ""} · UNIS ${T.value.t("app.title")}`;
});
if (store.quote.value) store.log("view");

// deep links: ?lang=zh&theme=light&plang=en&view=proposal#proposal
const qs = new URLSearchParams(location.search);
if (LANGS.some(l => l.id === qs.get("lang"))) st.prefs.lang = qs.get("lang") as Lang;
if (qs.get("theme") === "dark" || qs.get("theme") === "light") st.prefs.theme = qs.get("theme") as "dark" | "light";
if (LANGS.some(l => l.id === qs.get("plang"))) st.prefs.proposalLang = qs.get("plang") as Lang;
const proposalOnly = ref(qs.get("view") === "proposal");
// ?quote=Q-STANDARD opens a quote by number (e.g. a link straight to the standard rate sheet)
const byNumber = qs.get("quote") && store.state.quotes.find(q => q.number === qs.get("quote"));
if (byNumber) store.openQuote(byNumber.id);
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
  store.saveVersion(note.value.trim());
  note.value = "";
  saving.value = false;
}
function loadTemplate() {
  store.applyDefaultTemplate();
  confirmTemplate.value = false;
  flash.value = T.value.t("e.templateDone");
  setTimeout(() => (flash.value = ""), 2500);
}
const setLang = (l: Lang) => (st.prefs.lang = l);
const h = computed(() => store.quote.value!.draft.header);
const touch = () => store.touch();
const toggleTheme = () => (st.prefs.theme = st.prefs.theme === "light" ? "dark" : "light");
const itemLogo = computed(() => (st.prefs.theme === "light" ? itemLogoLight : itemLogoDark));
</script>

<template>
  <a class="skip" href="#main">{{ T.t("a.skip") }}</a>
  <header class="top no-print">
    <div class="brand">
      <span class="org">{{ T.t("app.brand") }}</span>
      <h1>{{ T.t("app.title") }}</h1>
    </div>
    <button class="btn pick" @click="drawer = 'customers'">
      <span class="lbl">{{ T.t("h.customer") }}</span>{{ store.customer.value?.company ?? T.t("h.selectCustomer") }}
    </button>
    <template v-if="store.quote.value">
      <label class="field">
        <span class="lbl">{{ T.t("h.quote") }}</span>
        <select class="input qsel" :value="store.quote.value.id" @change="store.openQuote(($event.target as HTMLSelectElement).value)">
          <option v-for="q in customerQuotes" :key="q.id" :value="q.id">{{ q.number }}{{ q.draft.header.title ? ` · ${q.draft.header.title}` : "" }}</option>
        </select>
      </label>
      <label class="field">
        <span class="lbl">{{ T.t("h.status") }}</span>
        <select class="input" :value="store.quote.value.status" @change="store.setStatus(($event.target as HTMLSelectElement).value as QuoteStatus)">
          <option v-for="s in statuses" :key="s" :value="s">{{ T.t(`status.${s}`) }}</option>
        </select>
      </label>
      <button class="btn sm" @click="store.createQuote(store.customer.value!.id)">{{ T.t("h.newQuote") }}</button>
    </template>
    <span class="sp"></span>
    <template v-if="store.quote.value">
      <span class="vstate" :class="store.dirty.value ? 'warn' : 'ok'" role="status">
        {{ store.dirty.value ? T.t("v.unsaved") : T.t("v.upToDate", { n: store.latestVersion.value?.v ?? 0 }) }}
      </span>
      <button class="btn primary sm" :disabled="!store.dirty.value || store.readOnly.value" @click="saving = true">{{ T.t("h.saveVersion") }}</button>
      <button class="btn sm" @click="drawer = 'versions'">{{ T.t("h.versions") }} ({{ store.quote.value.versions.length }})</button>
      <button class="btn sm" @click="drawer = 'mapping'">{{ T.t("m.button") }}</button>
    </template>
    <button class="btn sm" @click="drawer = 'history'">{{ T.t("h.history") }}</button>
    <span v-if="st.user" class="user">
      <span class="sync" :class="st.sync" role="status">{{ T.t(`s.${st.sync}`) }}</span>
      <span class="who" :title="st.user.email">{{ st.user.name || st.user.email }}</span>
      <button class="btn ghost sm" @click="signOut">{{ T.t("s.signOut") }}</button>
    </span>
    <div class="seg" role="group" aria-label="Language">
      <button v-for="l in LANGS" :key="l.id" :class="{ on: st.prefs.lang === l.id }" :aria-pressed="st.prefs.lang === l.id" @click="setLang(l.id)">{{ l.label }}</button>
    </div>
    <ThemeToggle :theme="st.prefs.theme" :label="st.prefs.theme === 'light' ? T.t('h.nightView') : T.t('h.dayView')" @toggle="toggleTheme" />
  </header>

  <div v-if="store.readOnly.value" class="banner no-print" role="status">
    {{ T.t("e.readOnly", { v: st.viewingVersion! }) }}
    <button class="btn sm" @click="store.viewVersion(null)">{{ T.t("e.backToDraft") }}</button>
    <button class="btn sm primary" @click="store.restoreVersion(st.viewingVersion!)">{{ T.t("e.restoreDraft") }}</button>
  </div>

  <main v-if="!store.quote.value" id="main" class="empty no-print">
    <p>{{ T.t("h.noQuote") }}</p>
    <button class="btn primary" @click="drawer = 'customers'">{{ T.t("h.selectCustomer") }}</button>
  </main>

  <div v-else class="layout" :class="{ solo: proposalOnly }">
    <nav v-if="!proposalOnly" class="side no-print" aria-label="Categories">
      <a v-for="c in cats" :key="c.cat.id" :href="`#cat-${c.cat.id}`">
        <span>{{ T.tc(c.cat.name) }}</span><span v-if="c.selected" class="cnt">{{ c.selected }}</span>
      </a>
      <a href="#proposal" class="prop">{{ T.t("p.toolbar") }}</a>
    </nav>

    <main id="main">
      <template v-if="!proposalOnly">
        <section class="details no-print" aria-labelledby="qd">
          <button class="dhead" :aria-expanded="detailsOpen" @click="detailsOpen = !detailsOpen">
            <span id="qd" class="dt">{{ T.t("q.details") }}</span>
            <span class="muted">{{ store.quote.value.number }} · {{ h.facility ? T.tc(h.facility) : T.t("q.allFacilities") }} · {{ h.effectiveDate }} · {{ h.validDays }}d</span>
            <span class="sp"></span><span aria-hidden="true">{{ detailsOpen ? "▴" : "▾" }}</span>
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

        <div class="template no-print">
          <div>
            <span class="dt">{{ T.t("e.template") }}</span>
            <span class="hint">{{ T.t("e.templateHint") }}</span>
          </div>
          <template v-if="!store.readOnly.value">
            <template v-if="confirmTemplate">
              <span class="warn-text">{{ T.t("e.templateConfirm") }}</span>
              <button class="btn sm primary" @click="loadTemplate">{{ T.t("c.yes") }}</button>
              <button class="btn sm" @click="confirmTemplate = false">{{ T.t("c.cancel") }}</button>
            </template>
            <button v-else class="btn sm" @click="confirmTemplate = true">{{ T.t("e.applyTemplate") }}</button>
          </template>
          <span v-if="flash" class="tag ok" role="status">{{ flash }}</span>
        </div>

        <div class="filters no-print">
          <input class="input search" type="search" v-model="search" :placeholder="T.t('e.search')" :aria-label="T.t('e.search')" />
          <div class="chips" role="group" aria-label="Channel">
            <button v-for="ch in (['All', 'B2B', 'D2C'] as const)" :key="ch" class="chip sm" :class="{ sel: st.prefs.channel === ch }" @click="st.prefs.channel = ch">
              {{ ch === "All" ? T.t("e.channelAll") : ch }}
            </button>
          </div>
          <span class="sp"></span>
          <label class="switch"><input type="checkbox" v-model="st.prefs.showAll" /><span class="track" aria-hidden="true"></span>{{ T.t("h.showAll") }}</label>
        </div>
        <p v-if="!anyMatch" class="muted no-print">{{ T.t("e.noMatch") }}</p>

        <section v-for="c in cats" v-show="c.main.length || c.adv.length" :key="c.cat.id" :id="`cat-${c.cat.id}`" class="cat no-print" :aria-labelledby="`h-${c.cat.id}`">
          <div class="cat-head">
            <h2 :id="`h-${c.cat.id}`">{{ T.tc(c.cat.name) }}</h2>
            <span v-if="c.selected" class="tag">{{ T.t("e.selected", { n: c.selected }) }}</span>
          </div>
          <p class="muted cat-desc">{{ T.tc(c.cat.desc) }}</p>
          <div class="list">
            <ChargeCard v-for="ch in c.main" :key="ch.id" :charge="ch" />
          </div>
          <details v-if="c.adv.length" class="adv" :open="advOpen[c.cat.id] || st.prefs.showAll || !!search || selectedIn(c.adv) > 0"
                   @toggle="advOpen[c.cat.id] = ($event.target as HTMLDetailsElement).open">
            <summary>{{ T.t("e.advanced", { n: c.adv.length }) }}<span v-if="selectedIn(c.adv)" class="hint">, {{ T.t("e.selected", { n: selectedIn(c.adv) }) }}</span></summary>
            <div class="list"><ChargeCard v-for="ch in c.adv" :key="ch.id" :charge="ch" /></div>
          </details>
        </section>
      </template>

      <ProposalView />
    </main>
  </div>

  <footer class="foot no-print">
    <a class="item" href="https://item.com" target="_blank" rel="noopener">
      <span>{{ T.t("f.supported") }}</span>
      <img :src="itemLogo" :alt="T.t('f.itemAlt')" width="120" height="47" />
    </a>
    <span class="sp"></span>
    <span v-if="st.lastSaved && !st.user" class="hint">{{ T.t("v.autosaved") }}</span>
  </footer>

  <CustomersDrawer v-if="drawer === 'customers'" @close="drawer = ''" />
  <VersionsDrawer v-if="drawer === 'versions' && store.quote.value" @close="drawer = ''" />
  <HistoryDrawer v-if="drawer === 'history'" @close="drawer = ''" />
  <Drawer v-if="drawer === 'mapping' && store.data.value" :title="`${T.t('m.title')} · ${store.quote.value?.number}`" wide @close="drawer = ''">
    <ChargeCodeMapping :data="store.data.value" />
  </Drawer>

  <div v-if="saving" class="modal no-print" @click.self="saving = false">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sv">
      <h3 id="sv">{{ T.t("v.saveTitle", { n: (store.latestVersion.value?.v ?? 0) + 1 }) }}</h3>
      <textarea class="input" rows="3" v-model="note" :placeholder="T.t('v.notePh')" autofocus></textarea>
      <h4 class="chk">{{ T.t("m.check") }}</h4>
      <ChargeCodeMapping :data="store.quote.value!.draft" compact />
      <div class="acts"><button class="btn" @click="saving = false">{{ T.t("c.cancel") }}</button><button class="btn primary" @click="saveVersion">{{ T.t("c.save") }}</button></div>
    </div>
  </div>
</template>

<style scoped>
.top { position: sticky; top: 0; z-index: 20; display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; padding: 10px 20px;
  background: var(--sidebar); border-bottom: 1px solid var(--border); }
.brand { display: flex; flex-direction: column; margin-right: 10px; line-height: 1.15; }
.brand .org { font-size: 12px; color: var(--muted-fg); font-weight: 500; }
.brand h1 { font-size: 18px; margin: 0; font-weight: 700; }
.lbl { display: block; font-size: 11px; color: var(--muted-fg); font-weight: 500; }
.pick { flex-direction: column; align-items: flex-start; gap: 0; padding: 3px 12px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
.field { display: flex; flex-direction: column; }
.qsel { max-width: 300px; }
.vstate { font-size: 12.5px; align-self: center; }
.user { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; }
.user .who { color: var(--muted-fg); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sync { color: var(--muted-fg); }
.sync.error, .sync.conflict { color: var(--orange); }
.vstate.warn { color: var(--orange); }
.vstate.warn::before { content: "● "; }
.vstate.ok { color: var(--muted-fg); }
.sp { flex: 1; }
.banner { background: var(--orange-soft); color: var(--fg); padding: 8px 20px; display: flex; gap: 10px; align-items: center; border-bottom: 1px solid var(--border); }
.empty { text-align: center; padding: 80px 20px; }
.layout { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 32px; max-width: 1320px; margin: 0 auto; padding: 24px 20px; }
.layout.solo { grid-template-columns: minmax(0, 1fr); max-width: 1060px; }
.side { position: sticky; top: 84px; align-self: start; display: flex; flex-direction: column; }
.side a { display: flex; justify-content: space-between; padding: 7px 10px; border-radius: var(--radius-sm); color: var(--fg); text-decoration: none; }
.side a:hover { background: var(--accent); }
.side .cnt { color: var(--primary-text); font-weight: 600; font-variant-numeric: tabular-nums; }
.side .prop { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 10px; color: var(--primary-text); font-weight: 600; }
main { min-width: 0; }
.details { border-bottom: 1px solid var(--border); margin-bottom: 14px; }
.dhead { display: flex; gap: 10px; align-items: baseline; width: 100%; background: none; border: 0; padding: 4px 0 12px; cursor: pointer; text-align: left; flex-wrap: wrap; }
.dt { font-weight: 600; }
.dgrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding-bottom: 16px; }
.dgrid label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted-fg); }
.dgrid .wide { grid-column: span 2; }
.template { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 4px 0 14px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.template > div { display: flex; flex-direction: column; flex: 1; min-width: 220px; }
.warn-text { color: var(--orange); font-size: 13px; }
.filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; position: sticky; top: 62px; z-index: 5; background: var(--bg); padding: 8px 0; }
.search { width: 260px; }
.switch { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 13px; }
.switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.switch .track { width: 34px; height: 20px; border-radius: 10px; background: var(--muted); border: 1px solid var(--border); position: relative; }
.switch .track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--muted-fg); }
.switch input:checked + .track { background: var(--primary); border-color: var(--primary); }
.switch input:checked + .track::after { left: 16px; background: #fff; }
.switch input:focus-visible + .track { outline: 2px solid var(--ring); outline-offset: 2px; }
.cat { margin: 26px 0 30px; }
.cat-head { display: flex; align-items: baseline; gap: 4px; }
.cat h2 { font-size: 20px; margin: 0; }
.cat-desc { margin: 2px 0 10px; }
.list { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); overflow: hidden; }
.adv { margin-top: 10px; }
.adv > summary { cursor: pointer; color: var(--primary-text); font-weight: 600; padding: 6px 2px; }
.adv > .list { margin-top: 6px; }
.foot { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 28px 20px; border-top: 1px solid var(--border); margin-top: 40px; }
.foot .item { display: inline-flex; align-items: center; gap: 12px; color: var(--muted-fg); text-decoration: none; font-size: 13px; padding: 6px 0; }
.foot .item img { width: 120px; height: auto; display: block; }
.modal { position: fixed; inset: 0; background: rgba(0, 0, 0, .55); z-index: 60; display: grid; place-items: center; }
.dialog { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; width: min(620px, 94vw); max-height: 90vh; overflow: auto; }
.dialog .chk { margin: 16px 0 8px; }
.dialog h3 { margin: 0 0 10px; }
.dialog textarea { width: 100%; }
.dialog .acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .side { position: static; flex-direction: row; flex-wrap: wrap; }
  .dgrid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .filters { top: 0; }
  .top { position: static; }
}
@media print { .layout { display: block; padding: 0; } }
</style>
