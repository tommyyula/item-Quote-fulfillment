<script setup lang="ts">
import { computed } from "vue";
import { useApp } from "../lib/context";
import { benchmarkFor, cellKey, minKey, unitRows } from "../lib/engine";
import { softLower } from "../lib/format";
import type { BuilderCharge, ChargeSel, Unit } from "../lib/types";
import PriceInput from "./PriceInput.vue";

const props = defineProps<{ charge: BuilderCharge; unit: Unit; s: ChargeSel; showAll: boolean; readOnly: boolean }>();
const { store, T } = useApp();
const us = computed(() => props.s.units[props.unit.id]);
const table = computed(() => unitRows(props.charge, props.s, props.unit, props.showAll));
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
const hasEdits = computed(() => Object.keys(props.s.prices).some(k => k.startsWith(`${props.unit.id}|`)));
function reset() {
  const s = store.sel(props.charge.id);
  for (const k of Object.keys(s.prices)) if (k.startsWith(`${props.unit.id}|`)) delete s.prices[k];
  store.touch();
}
const mk = computed(() => (us.value?.min ? minKey(props.unit.id, us.value.min) : ""));
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
          <td v-for="(cell, i) in r.cells" :key="i">{{ T.tc(cell) }}</td>
          <td v-for="c in cols" :key="c" class="num">
            <PriceInput :model-value="value(cellKey(unit.id, r.cells, c), benchmarkFor(r.d, c))" :benchmark="benchmarkFor(r.d, c)"
                        :lo="c === 'add' ? undefined : unit.lo" :hi="c === 'add' ? undefined : unit.hi" :readonly="readOnly"
                        @update:model-value="v => set(cellKey(unit.id, r.cells, c), v, benchmarkFor(r.d, c))" />
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
      <span class="hint">{{ T.t("e.benchHint", { basis: unit.basis, lo: unit.lo.toFixed(2), hi: unit.hi.toFixed(2) }) }}<template v-if="us?.second"> · {{ T.t("e.addHint") }}</template><template v-if="table.truncated"> · {{ T.t("e.truncated", { n: 300 }) }}</template></span>
      <button v-if="hasEdits && !readOnly" class="btn ghost sm" @click="reset">↺ {{ T.t("e.reset") }}</button>
    </div>
  </div>
</template>

<style scoped>
.rt { margin-top: 8px; overflow-x: auto; }
table { border-collapse: collapse; font-size: 13px; min-width: 300px; }
th { background: var(--soft); text-align: left; font-weight: 600; padding: 6px 10px; border: 1px solid var(--line); font-size: 12px; white-space: nowrap; }
td { padding: 4px 10px; border: 1px solid var(--line); }
.num { text-align: right; }
tr.min td { background: var(--panel-2); font-style: italic; }
.foot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
</style>
