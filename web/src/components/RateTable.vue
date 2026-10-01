<script setup lang="ts">
import { computed } from "vue";
import { useApp } from "../lib/context";
import { benchmarkFor, cellKey, minKey, unitRows } from "../lib/engine";
import { money, softLower } from "../lib/format";
import type { BuilderCharge, ChargeSel, Unit } from "../lib/types";
import PriceInput from "./PriceInput.vue";

const props = defineProps<{ charge: BuilderCharge; unit: Unit; unitKey?: string; s: ChargeSel; showAll: boolean; readOnly: boolean }>();
const uk = computed(() => props.unitKey ?? props.unit.id);
const { store, T } = useApp();
const us = computed(() => props.s.units[uk.value]);
const table = computed(() => unitRows(props.charge, props.s, props.unit, props.showAll, uk.value));
const cols = computed(() => (us.value?.second ? (["first", "add"] as const) : (["p"] as const)));
const colLabel = (c: string) => (c === "first" ? T.value.t("e.colFirst") : c === "add" ? T.value.t("e.colAdd") : T.value.t("e.colRate"));

function value(key: string, bench: number | null) {
  return key in props.s.prices ? props.s.prices[key] : bench;
}
function set(key: string, v: number | null, bench: number | null) {
  const s = store.sel(props.charge.id);
  if (v === bench) delete s.prices[key];
  else s.prices[key] = v;
  store.touch();
}
const hasEdits = computed(() => Object.keys(props.s.prices).some(k => k.startsWith(`${uk.value}|`)));
function reset() {
  const s = store.sel(props.charge.id);
  for (const k of Object.keys(s.prices)) if (k.startsWith(`${uk.value}|`)) delete s.prices[k];
  store.touch();
}
const mk = computed(() => (us.value?.min ? minKey(uk.value, us.value.min) : ""));
const minBench = computed(() => (us.value?.min ? props.unit.minDefault?.[us.value.min] ?? null : null));
</script>

<template>
  <div class="rt">
    <table>
      <thead>
        <tr>
          <th v-for="d in table.dims" :key="d.id">{{ T.tc(d.label) }}</th>
          <th v-for="c in cols" :key="c" class="num">{{ colLabel(c) }} <span class="muted">/ {{ softLower(T.tc(unit.label)) }}</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in table.rows" :key="r.cells.join('|')">
          <td v-for="(cell, i) in r.cells" :key="i"><span v-if="cell">{{ T.tc(cell) }}</span><span v-else class="muted">{{ T.t("e.flat") }}</span></td>
          <td v-for="c in cols" :key="c" class="num">
            <PriceInput :model-value="value(cellKey(uk, r.cells, c), benchmarkFor(r.d, c))" :benchmark="benchmarkFor(r.d, c)"
                        :lo="c === 'add' ? undefined : unit.lo" :hi="c === 'add' ? undefined : unit.hi" :readonly="readOnly"
                        @update:model-value="v => set(cellKey(uk, r.cells, c), v, benchmarkFor(r.d, c))" />
          </td>
        </tr>
        <tr v-if="us?.min" class="min">
          <td :colspan="Math.max(table.dims.length, 1)">{{ T.t("e.minimumPer", { basis: T.t(`basis.${us.min}`) }) }}</td>
          <td :colspan="cols.length" class="num">
            <PriceInput :model-value="value(mk, minBench)" :benchmark="minBench" :readonly="readOnly" @update:model-value="v => set(mk, v, minBench)" />
          </td>
        </tr>
      </tbody>
    </table>
    <div class="foot">
      <span class="hint">{{ T.t("e.benchHint", { basis: unit.basis, lo: money(unit.lo), hi: money(unit.hi) }) }}<template v-if="us?.second"> · {{ T.t("e.addHint") }}</template><template v-if="table.truncated"> · {{ T.t("e.truncated", { n: 300 }) }}</template></span>
      <button v-if="hasEdits && !readOnly" class="btn ghost sm" @click="reset">↺ {{ T.t("e.reset") }}</button>
    </div>
  </div>
</template>

<style scoped>
.rt { margin-top: 10px; overflow-x: auto; }
table { border-collapse: collapse; font-size: 13px; min-width: 300px; }
th { text-align: left; font-weight: 600; padding: 6px 12px 6px 0; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--muted-fg); white-space: nowrap; }
td { padding: 5px 12px 5px 0; border-bottom: 1px solid var(--border); }
th.num, td.num { text-align: right; padding-right: 0; padding-left: 12px; }
tr.min td { color: var(--muted-fg); }
.foot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
</style>
