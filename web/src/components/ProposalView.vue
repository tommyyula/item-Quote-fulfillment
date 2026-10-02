<script setup lang="ts">
// Customer rate sheet in the layout of the UNIS Business Proposal template, with print / export.
import { computed, ref } from "vue";
import { LANGS, type Lang } from "../i18n";
import { useApp } from "../lib/context";
import { descText, exportExcel, exportJson, qualifierText, serviceLabel } from "../lib/export";
import { addDays, dateText, rateText, unitText } from "../lib/format";
import { buildProposal } from "../lib/proposal";
import { catalog } from "../lib/store";

const { store, T, PT } = useApp();
const sections = computed(() => (store.data.value ? buildProposal(catalog, store.data.value) : []));
const q = store.quote, c = store.customer;
const h = computed(() => store.data.value!.header);
const versionLabel = computed(() =>
  store.state.viewingVersion != null ? `v${store.state.viewingVersion}` : store.dirty.value ? T.value.t("h.draft") : `v${store.latestVersion.value?.v}`);
const isDraft = computed(() => store.state.viewingVersion == null && store.dirty.value);
const busy = ref(false);

function meta() {
  return { quote: q.value!, customer: c.value, data: store.data.value!, versionLabel: versionLabel.value };
}
function print() {
  store.log("print");
  window.print();
}
async function xlsx() {
  busy.value = true;
  try {
    await exportExcel(catalog, sections.value, meta(), PT.value);
    store.log("export", { detail: "Excel" });
  } finally {
    busy.value = false;
  }
}
function json() {
  exportJson(meta());
  store.log("export", { detail: "JSON" });
}
const setLang = (v: string) => (store.state.prefs.proposalLang = v as Lang | "");
</script>

<template>
  <div class="proposal" id="proposal">
    <div class="toolbar no-print">
      <h2>{{ T.t("p.toolbar") }}</h2>
      <span class="sp"></span>
      <label class="muted">{{ T.t("p.lang") }}
        <select class="input" :value="store.state.prefs.proposalLang" @change="setLang(($event.target as HTMLSelectElement).value)">
          <option value="">= UI ({{ LANGS.find(l => l.id === store.state.prefs.lang)?.label }})</option>
          <option v-for="l in LANGS" :key="l.id" :value="l.id">{{ l.label }}</option>
        </select>
      </label>
      <button class="btn primary" @click="print">{{ T.t("p.print") }}</button>
      <button class="btn" :disabled="busy" @click="xlsx">{{ T.t("p.xlsx") }}</button>
      <button class="btn" @click="json">{{ T.t("p.json") }}</button>
    </div>

    <article class="proposal-doc" :lang="PT.lang">
      <header class="doc-head">
        <div>
          <div class="brand">{{ PT.t("app.brand") }} <span v-if="isDraft" class="watermark">{{ PT.t("p.draft") }}</span></div>
          <div class="doc-title">{{ PT.t("p.title") }}</div>
          <div v-if="h.title" class="muted">{{ h.title }}</div>
        </div>
        <table class="meta"><tbody>
          <tr><th>{{ PT.t("p.quoteNo") }}</th><td>{{ q?.number }}</td></tr>
          <tr><th>{{ PT.t("p.version") }}</th><td>{{ versionLabel }}</td></tr>
          <tr><th>{{ PT.t("p.date") }}</th><td>{{ dateText(h.effectiveDate, PT) }}</td></tr>
          <tr><th>{{ PT.t("p.validUntil") }}</th><td>{{ dateText(addDays(h.effectiveDate, h.validDays), PT) }}</td></tr>
        </tbody></table>
      </header>

      <table class="cust"><tbody>
        <tr><th>{{ PT.t("p.company") }}</th><td>{{ c?.company }}</td><th>{{ PT.t("p.contact") }}</th><td>{{ c?.contact }}</td></tr>
        <tr><th>{{ PT.t("p.address") }}</th><td>{{ c?.address }}</td><th>{{ PT.t("p.phone") }}</th><td>{{ c?.phone }}</td></tr>
        <tr><th>{{ PT.t("p.cityStateZip") }}</th><td>{{ [c?.city, c?.state, c?.zip].filter(Boolean).join(", ") }}</td><th>{{ PT.t("p.email") }}</th><td>{{ c?.email }}</td></tr>
        <tr><th>{{ PT.t("p.facility") }}</th><td>{{ h.facility ? PT.tc(h.facility) : PT.t("q.allFacilities") }}</td><th>{{ PT.t("p.preparedBy") }}</th><td>{{ h.preparedBy }}</td></tr>
      </tbody></table>

      <div class="band">{{ PT.t("p.billedThrough") }}</div>

      <p v-if="!sections.length" class="muted empty">{{ PT.t("p.empty") }}</p>

      <section v-for="s in sections" :key="s.id" class="sec">
        <h3>{{ PT.tc(s.label) }}</h3>
        <table class="rates">
          <caption class="sr">{{ PT.tc(s.label) }}</caption>
          <colgroup><col class="c1" /><col class="c2" /><col class="c3" /><col class="c4" /></colgroup>
          <thead><tr><th scope="col">{{ PT.t("p.service") }}</th><th scope="col">{{ PT.t("p.desc") }}</th><th scope="col" class="r">{{ PT.t("p.rate") }}</th><th scope="col">{{ PT.t("p.unit") }}</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in s.rows" :key="i" :class="r.type">
              <td v-if="r.type === 'sub'" class="svc sub">{{ qualifierText(r, PT) }}</td>
              <td v-else-if="r.type === 'min'" class="svc sub">{{ PT.t("p.minimum") }}</td>
              <td v-else class="svc">{{ serviceLabel(r, PT) }}<div v-if="r.qualifiers?.length" class="q">{{ qualifierText(r, PT) }}</div></td>
              <td class="desc">{{ r.type === "item" || r.type === "group" ? descText(r, PT) : "" }}</td>
              <td class="r rate">{{ rateText(r.rate, PT) }}</td>
              <td class="unit">{{ r.rate ? unitText(r.unit, PT, { pct: r.rate.kind === "pct", num: r.rate.kind === "num", minBasis: r.isMinBasis }) : "" }}</td>
            </tr>
          </tbody>
        </table>
        <ul v-if="s.settings.length || s.note" class="notes">
          <li v-for="st in s.settings" :key="st.label">{{ PT.tc(st.label) }}: {{ PT.tc(st.value) }}</li>
          <li v-if="s.note">{{ PT.tc(s.note) }}</li>
        </ul>
      </section>

      <p class="terms">{{ PT.t("p.terms", { days: h.validDays }) }}</p>
      <p v-if="h.notes" class="terms"><b>{{ PT.t("q.notes") }}:</b> {{ h.notes }}</p>

      <div class="sign">
        <div v-for="who in [PT.t('p.signUnis'), c?.company || PT.t('p.signCustomer')]" :key="who">
          <div class="who">{{ who }}</div>
          <div v-for="k in ['p.signature', 'p.printed', 'p.titleLbl', 'p.date']" :key="k" class="line"><span>{{ PT.t(k) }}</span></div>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
/* The rate sheet is a document: white paper in both themes, identical to what prints (the preview is the contract). */
.toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 36px 0 12px; }
.toolbar h2 { margin: 0; font-size: 20px; }
.toolbar .sp { flex: 1; }
.toolbar label { display: flex; gap: 6px; align-items: center; font-size: 13px; }
.proposal-doc { --ink: #181818; --soft-ink: #666666; --rule: #e0e0e0; --rule-strong: #181818;
  background: #ffffff; color: var(--ink); border-radius: var(--radius); padding: 36px 40px; max-width: 1000px; color-scheme: light; }
.doc-head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid var(--rule-strong); padding-bottom: 14px; margin-bottom: 16px; }
.brand { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
.doc-title { font-size: 16px; font-weight: 500; }
.doc-head .muted, .proposal-doc .muted { color: var(--soft-ink); }
.watermark { display: inline-block; margin-left: 10px; font-size: 13px; font-weight: 600; color: #c2410c; vertical-align: 3px; }
.watermark::before { content: "● "; }
.meta th, .cust th { text-align: left; color: var(--soft-ink); font-weight: 500; font-size: 12.5px; padding: 2px 12px 2px 0; white-space: nowrap; }
.meta td, .cust td { padding: 2px 18px 2px 0; }
.cust { width: 100%; margin-bottom: 18px; }
.band { border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 8px 0; font-weight: 600; }
.sec { margin-top: 22px; }
.sec h3 { font-size: 16px; margin: 0 0 6px; }
table.rates { width: 100%; border-collapse: collapse; font-size: 13px; }
table.rates col.c1 { width: 34%; } table.rates col.c2 { width: 38%; } table.rates col.c3 { width: 14%; } table.rates col.c4 { width: 14%; }
table.rates th { text-align: left; font-size: 12px; color: var(--soft-ink); font-weight: 500; border-bottom: 1px solid var(--rule-strong); padding: 5px 8px; }
table.rates td { padding: 6px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; }
.r { text-align: right !important; }
.svc { font-weight: 600; }
.svc.sub { font-weight: 400; padding-left: 24px !important; }
.svc .q { font-weight: 400; font-size: 12.5px; color: var(--soft-ink); }
tr.group td { border-bottom: 0; padding-bottom: 2px; }
tr.min td { color: var(--soft-ink); }
.desc { color: var(--soft-ink); font-size: 13px; }
.rate { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; text-align: right; }
.unit { color: var(--soft-ink); font-size: 13px; }
.notes { margin: 8px 0 0; padding-left: 18px; color: var(--soft-ink); font-size: 12.5px; }
.terms { font-size: 12.5px; color: var(--soft-ink); margin-top: 20px; max-width: 72ch; }
.empty { padding: 20px 0; color: var(--soft-ink); }
.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 30px; }
.who { font-weight: 600; margin-bottom: 8px; }
.line { border-bottom: 1px solid var(--rule-strong); height: 32px; display: flex; align-items: flex-end; font-size: 11.5px; color: var(--soft-ink); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 700px) { .proposal-doc { padding: 18px; } .doc-head { flex-direction: column; } .sign { grid-template-columns: 1fr; } }
</style>
