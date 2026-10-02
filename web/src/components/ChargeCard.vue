<script setup lang="ts">
import { computed, ref } from "vue";
import { useApp } from "../lib/context";
import { activeUnits, emptySel, unitRows } from "../lib/engine";
import { isMarkup, money, pct, softLower } from "../lib/format";
import type { Charge } from "../lib/types";
import BuilderBody from "./BuilderBody.vue";
import PriceInput from "./PriceInput.vue";

const props = defineProps<{ charge: Charge }>();
const { store, T } = useApp();
const EMPTY = emptySel();
const s = computed(() => store.data.value?.selections[props.charge.id] ?? EMPTY);
const ro = computed(() => store.readOnly.value);
const open = ref(true);

function toggle(e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  store.sel(props.charge.id).on = on;
  if (on) open.value = true;
  store.touch();
}
const price = computed(() => (props.charge.kind === "simple" ? (s.value.price === undefined ? props.charge.default : s.value.price) : null));
function setPrice(v: number | null) {
  store.sel(props.charge.id).price = v;
  store.touch();
}
// summary shown in the header of an included builder charge
const rateCount = computed(() => {
  const c = props.charge;
  if (c.kind !== "builder" || !s.value.on) return 0;
  const all = store.state.prefs.showAll || !!s.value.showAll;
  return activeUnits(c, s.value, all).reduce((n, { key, unit: u }) => {
    const us = s.value.units[key];
    return n + unitRows(c, s.value, u, all, key).rows.length * (us.second ? 2 : 1) + (us.min ? 1 : 0);
  }, 0);
});
const unitLabel = computed(() => {
  const c = props.charge;
  if (c.kind !== "simple") return "";
  if (c.pct) return isMarkup(c.unit) ? T.value.t("e.markup") : T.value.tc(c.unit);
  if (/^one-time/i.test(c.unit)) return T.value.t("e.oneTime");
  return T.value.t("e.per", { unit: softLower(T.value.tc(c.unit)) });
});
</script>

<template>
  <div class="card" :class="{ on: s.on }" :id="`ch-${charge.id}`">
    <div class="head">
      <input type="checkbox" :checked="s.on" :disabled="ro" @change="toggle" :aria-label="T.tc(charge.name)" />
      <div class="title" @click="charge.kind === 'builder' && s.on && (open = !open)" :class="{ clickable: charge.kind === 'builder' && s.on }">
        <span class="name">{{ T.tc(charge.name) }}</span>
        <span v-if="charge.kind === 'builder'" class="tag">{{ T.t("e.builder") }}</span>
        <span v-else-if="charge.channel !== 'Both'" class="tag">{{ charge.channel }}</span>
        <span v-if="charge.kind === 'simple' && charge.new" class="tag new">{{ T.t("e.new") }}</span>
        <div class="desc">{{ T.tc(charge.desc) }}</div>
      </div>
      <div v-if="charge.kind === 'simple'" class="price">
        <PriceInput :model-value="price" :benchmark="charge.default" :lo="charge.lo" :hi="charge.hi" :pct="charge.pct" :readonly="ro || !s.on"
                    @update:model-value="setPrice" />
        <div class="unit">{{ unitLabel }}<div class="hint">{{ charge.pct ? `${pct(charge.lo)} – ${pct(charge.hi)}` : `${money(charge.lo)} – ${money(charge.hi)}` }}</div></div>
      </div>
      <div v-else class="sum">
        <span v-if="s.on" class="tag">{{ T.t(rateCount === 1 ? "e.rate1" : "e.rates", { n: rateCount }) }}</span>
        <button v-if="s.on" class="btn ghost sm" @click="open = !open">{{ open ? T.t("e.collapse") : T.t("e.expand") }}</button>
      </div>
    </div>
    <BuilderBody v-if="charge.kind === 'builder' && s.on && open" :charge="charge" :s="s" :read-only="ro" />
  </div>
</template>

<style scoped>
.card { border-bottom: 1px solid var(--border); position: relative; }
.card:last-child { border-bottom: 0; }
.card.on::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--primary); }
.head { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 16px; }
.head input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--primary); }
.title { min-width: 0; }
.title.clickable { cursor: pointer; }
.name { font-weight: 600; }
.desc { color: var(--muted-fg); font-size: 13px; }
.price { display: flex; align-items: center; gap: 10px; }
.unit { font-size: 12.5px; color: var(--muted-fg); min-width: 116px; }
.sum { display: flex; align-items: center; gap: 8px; }
@media (max-width: 700px) { .head { grid-template-columns: 22px minmax(0, 1fr); } .price, .sum { grid-column: 2; } }
</style>
