<script setup lang="ts">
// Version control: list saved versions, view read-only, restore into the draft, compare any two (or a version vs the draft).
import { computed, ref } from "vue";
import { useApp } from "../lib/context";
import { chargeIndex, quoteLines } from "../lib/engine";
import { dateTimeText, money, pct, softLower } from "../lib/format";
import { catalog } from "../lib/store";
import type { QuoteData, QuoteLine } from "../lib/types";
import Drawer from "./Drawer.vue";

const emit = defineEmits<{ close: [] }>();
const { store, T } = useApp();
const q = computed(() => store.quote.value!);
const versions = computed(() => [...q.value.versions].reverse());
const idx = chargeIndex(catalog);

const a = ref<string>(q.value.versions.at(-1) ? String(q.value.versions.at(-1)!.v) : "draft");
const b = ref<string>("draft");
const dataOf = (k: string): QuoteData => (k === "draft" ? q.value.draft : q.value.versions.find(v => String(v.v) === k)!.data);

const label = (l: QuoteLine) => {
  const t = T.value;
  const parts = [t.tc(idx[l.chargeId].charge.name)];
  if (l.col === "min") parts.push(t.t("e.minimumPer", { basis: t.t(`basis.${l.minBasis}`) }));
  else {
    if (l.unitId) parts.push(t.t("e.perUnit", { unit: softLower(t.tc(l.unitLabel)) }));
    parts.push(...l.dims.map(d => t.tc(d.value)));
    if (l.col === "first") parts.push(t.t("e.colFirst"));
    if (l.col === "add") parts.push(t.t("e.colAdd"));
  }
  return parts.join(" · ");
};
const fmt = (l: QuoteLine) => (l.price == null ? "—" : l.pct ? pct(l.price) : money(l.price));
const diff = computed(() => {
  const A = new Map(quoteLines(catalog, dataOf(a.value)).map(l => [l.key, l]));
  const B = new Map(quoteLines(catalog, dataOf(b.value)).map(l => [l.key, l]));
  const out: { kind: "added" | "removed" | "changed"; text: string; from?: string; to?: string }[] = [];
  for (const [k, l] of B) {
    const o = A.get(k);
    if (!o) out.push({ kind: "added", text: label(l), to: fmt(l) });
    else if (o.price !== l.price) out.push({ kind: "changed", text: label(l), from: fmt(o), to: fmt(l) });
  }
  for (const [k, l] of A) if (!B.has(k)) out.push({ kind: "removed", text: label(l), from: fmt(l) });
  return out;
});
function view(v: number) {
  store.viewVersion(v);
  emit("close");
}
function restore(v: number) {
  store.restoreVersion(v);
  emit("close");
}
</script>

<template>
  <Drawer :title="`${T.t('v.title')} · ${q.number}`" wide @close="emit('close')">
    <p v-if="!versions.length" class="muted">{{ T.t("v.none") }}</p>
    <table v-else class="vers"><tbody>
      <tr v-for="v in versions" :key="v.v" :class="{ cur: store.state.viewingVersion === v.v }">
        <td><b>v{{ v.v }}</b></td>
        <td>{{ dateTimeText(v.savedAt, T) }}</td>
        <td class="note-cell">{{ v.note }}</td>
        <td class="hint">{{ T.t("v.lines", { n: v.lineCount }) }}</td>
        <td class="acts">
          <button class="btn sm" @click="view(v.v)">{{ T.t("c.view") }}</button>
          <button class="btn sm" @click="restore(v.v)">{{ T.t("e.restoreDraft") }}</button>
        </td>
      </tr>
    </tbody></table>

    <h4>{{ T.t("c.compare") }}</h4>
    <div class="cmp">
      <label>{{ T.t("v.compareA") }}
        <select class="input" v-model="a"><option v-for="v in versions" :key="v.v" :value="String(v.v)">v{{ v.v }}</option><option value="draft">{{ T.t("v.draft") }}</option></select>
      </label>
      <label>{{ T.t("v.compareB") }}
        <select class="input" v-model="b"><option value="draft">{{ T.t("v.draft") }}</option><option v-for="v in versions" :key="v.v" :value="String(v.v)">v{{ v.v }}</option></select>
      </label>
    </div>
    <p v-if="!diff.length" class="muted">{{ T.t("v.noDiff") }}</p>
    <table v-else class="diff"><tbody>
      <tr v-for="(d, i) in diff" :key="i" :class="d.kind">
        <td><span class="badge" :class="d.kind === 'added' ? 'ok' : d.kind === 'removed' ? 'warn' : ''">{{ T.t(`v.${d.kind}`) }}</span></td>
        <td>{{ d.text }}</td>
        <td class="num"><s v-if="d.from && d.kind === 'changed'">{{ d.from }}</s><span v-else-if="d.kind === 'removed'">{{ d.from }}</span></td>
        <td class="num"><b>{{ d.to }}</b></td>
      </tr>
    </tbody></table>
  </Drawer>
</template>

<style scoped>
.vers, .diff { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 14px; }
.vers td, .diff td { padding: 6px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
.vers tr.cur { background: var(--brand-soft); }
.note-cell { max-width: 260px; }
.acts { white-space: nowrap; text-align: right; }
.acts .btn { margin-left: 4px; }
.cmp { display: flex; gap: 12px; margin-bottom: 10px; }
.cmp label { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--muted); }
.num { text-align: right; white-space: nowrap; }
.diff tr.removed td { color: var(--muted); }
</style>
