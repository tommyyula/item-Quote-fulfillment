<script setup lang="ts">
// Mapback of the quote to existing billing-system charge codes, and the list of what must be set up first.
import { computed, ref } from "vue";
import { useApp } from "../lib/context";
import { mapQuote, setupList, summarize, type LineMapping } from "../lib/codemap";
import { chargeIndex } from "../lib/engine";
import { money, pct, softLower } from "../lib/format";
import { catalog } from "../lib/store";
import type { QuoteData } from "../lib/types";

const props = defineProps<{ data: QuoteData; compact?: boolean }>();
const { T } = useApp();
const idx = chargeIndex(catalog);
const lines = computed(() => mapQuote(catalog, props.data));
const sum = computed(() => summarize(lines.value));
const setup = computed(() => setupList(catalog, lines.value));
const filter = ref<"all" | "setup">("all");
const shown = computed(() => (filter.value === "all" ? lines.value : lines.value.filter(l => l.status !== "mapped")));

const lineLabel = (m: LineMapping) => {
  const t = T.value, c = idx[m.chargeId].charge;
  const unit = c.kind === "builder" && m.unitId ? c.units.find(u => u.id === m.unitId)?.label : undefined;
  return [t.tc(c.name), unit ? t.t("e.perUnit", { unit: softLower(t.tc(unit)) }) : ""].filter(Boolean).join(", ");
};
const isPct = (m: LineMapping) => idx[m.chargeId].charge.kind === "simple" && (idx[m.chargeId].charge as { pct: boolean }).pct;
const rate = (m: LineMapping) => (m.price == null ? T.value.t("p.tbd") : isPct(m) ? pct(m.price) : money(m.price));
</script>

<template>
  <div class="ccm">
    <p class="sum" role="status">
      <b>{{ T.t("m.summary", { mapped: sum.mapped, total: sum.total }) }}</b>
      <span v-if="sum.newCondition" class="tag warn">{{ sum.newCondition }} {{ T.t("m.new-condition") }}</span>
      <span v-if="sum.newItem" class="tag new">{{ sum.newItem }} {{ T.t("m.new-item") }}</span>
    </p>

    <section v-if="setup.length" class="setup" aria-labelledby="setup-h">
      <h4 id="setup-h">{{ T.t("m.setupTitle") }}</h4>
      <p class="hint">{{ T.t("m.setupHint") }}</p>
      <ul>
        <li v-for="(s, i) in setup" :key="i">
          <span class="kind" :class="s.kind">{{ T.t(`m.${s.kind}`) }}</span>
          <span v-if="s.kind === 'new-item'">{{ T.t("m.suggested", { name: s.suggestedName ?? "" }) }} <span class="muted">({{ T.tc(idx[s.chargeId].charge.name) }})</span></span>
          <span v-else>{{ T.t("m.addCond", { key: s.conditionKey ?? "", code: s.code ?? "" }) }} <span class="muted">{{ s.systemName }}; {{ T.t("m.values", { v: s.values.join(", ") }) }}</span></span>
        </li>
      </ul>
    </section>
    <p v-else class="ok-text">{{ T.t("m.allMapped") }}</p>

    <template v-if="!compact">
      <div class="chips" role="group" aria-label="Filter">
        <button class="chip sm" :class="{ sel: filter === 'all' }" @click="filter = 'all'">{{ T.t("m.filterAll") }} ({{ sum.total }})</button>
        <button class="chip sm" :class="{ sel: filter === 'setup' }" @click="filter = 'setup'">{{ T.t("m.filterSetup") }} ({{ sum.total - sum.mapped }})</button>
      </div>
      <div class="tw">
        <table>
          <caption class="sr">{{ T.t("m.title") }}</caption>
          <thead><tr>
            <th scope="col">{{ T.t("m.line") }}</th><th scope="col" class="r">{{ T.t("m.rate") }}</th><th scope="col">{{ T.t("m.code") }}</th>
            <th scope="col">{{ T.t("m.conds") }}</th><th scope="col">{{ T.t("m.status") }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="m in shown" :key="m.lineKey">
              <td>{{ lineLabel(m) }}<div v-if="m.col === 'min'" class="hint">{{ T.t("e.minimumPer", { basis: T.t(`basis.${m.minBasis}`) }) }}</div></td>
              <td class="r num">{{ rate(m) }}</td>
              <td>
                <template v-if="m.code"><code>{{ m.code }}</code><div class="hint">{{ m.systemName }} · {{ m.systemUom }}</div>
                  <div v-if="m.initialCode" class="hint">{{ T.t("m.initial", { code: m.initialCode }) }}</div></template>
                <span v-else class="hint">{{ m.suggestedName }}</span>
              </td>
              <td class="conds">
                <div v-for="(c, i) in m.conditions" :key="i" :class="{ miss: !c.supported }">{{ c.key }}: {{ c.value }}</div>
                <div v-for="(n, i) in m.notes" :key="'n' + i" class="hint">{{ n }}</div>
              </td>
              <td><span class="kind" :class="m.status">{{ T.t(`m.${m.status}`) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sum { display: flex; gap: 4px; align-items: baseline; flex-wrap: wrap; margin: 0 0 12px; }
.setup { border-left: 2px solid var(--orange); padding: 2px 0 2px 14px; margin-bottom: 14px; }
.setup h4 { margin: 0 0 2px; }
.setup ul { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.setup li { font-size: 13px; }
.kind { display: inline-block; min-width: 128px; font-size: 12px; font-weight: 600; }
.kind.mapped { color: var(--ok); }
.kind.new-condition { color: var(--orange); }
.kind.new-item { color: var(--destructive); }
.ok-text { color: var(--ok); }
.tw { overflow-x: auto; margin-top: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th { text-align: left; color: var(--muted-fg); font-weight: 500; border-bottom: 1px solid var(--border); padding: 6px 8px 6px 0; white-space: nowrap; }
td { border-bottom: 1px solid var(--border); padding: 6px 8px 6px 0; vertical-align: top; }
.r { text-align: right; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
code { font-size: 12px; }
.conds .miss { color: var(--orange); }
.conds .miss::before { content: "+ "; font-weight: 700; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
