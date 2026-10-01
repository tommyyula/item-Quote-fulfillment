<script setup lang="ts">
// Progressive questions for a builder charge: factors -> units -> price driver / minimum / additional-unit rate -> rate table.
import { computed, ref } from "vue";
import { useApp } from "../lib/context";
import { activeConds, activeUnits, chosenDriverIds, nextUnitKey, passes } from "../lib/engine";
import { softLower } from "../lib/format";
import type { BuilderCharge, ChargeSel, Cond, Unit } from "../lib/types";
import RateTable from "./RateTable.vue";

const props = defineProps<{ charge: BuilderCharge; s: ChargeSel; readOnly: boolean }>();
const { store, T } = useApp();
const moreConds = ref(false);
const moreUnits = ref(false);
const showAll = computed(() => store.state.prefs.showAll || !!props.s.showAll);
const edit = () => { store.touch(); return store.sel(props.charge.id); };

// ---- step 1
const condShown = computed(() => props.charge.conds.filter(cd => cd.common || moreConds.value || showAll.value || props.s.conds[cd.id]?.on));
const hiddenConds = computed(() => props.charge.conds.length - condShown.value.length);
const ticked = computed(() => props.charge.conds.filter(cd => props.s.conds[cd.id]?.on));
const withValues = computed(() => new Set(activeConds(props.charge, props.s).map(x => x.cond.id)));
function toggleCond(cd: Cond) {
  const s = edit();
  s.conds[cd.id] = s.conds[cd.id] ?? { on: false, values: [] };
  s.conds[cd.id].on = !s.conds[cd.id].on;
}
function toggleVal(cd: Cond, v: string) {
  const cs = edit().conds[cd.id];
  cs.values = cs.values.includes(v) ? cs.values.filter(x => x !== v) : [...cs.values, v];
}
const setAll = (cd: Cond, on: boolean) => (edit().conds[cd.id].values = on ? [...cd.values] : []);
const setText = (cd: Cond, text: string) => (edit().conds[cd.id].text = text);

// ---- step 2
const allowed = computed(() => props.charge.units.filter(u => passes(props.charge, props.s, u.when, showAll.value)));
const unitsShown = computed(() => allowed.value.filter(u => u.common || moreUnits.value || showAll.value || props.s.units[u.id]?.on));
const ruleHidden = computed(() => props.charge.units.filter(u => !passes(props.charge, props.s, u.when, showAll.value)));
function toggleUnit(u: Unit) {
  const s = edit();
  s.units[u.id] = s.units[u.id] ?? { on: false };
  s.units[u.id].on = !s.units[u.id].on;
}
const activeU = computed(() => activeUnits(props.charge, props.s, showAll.value));
const methodsOf = (u: Unit) => activeU.value.filter(x => x.unit.id === u.id).length;
function addMethod(u: Unit) {
  const s = edit();
  s.units[nextUnitKey(u, s)] = { on: true };
}
function removeMethod(k: string) {
  const s = edit();
  delete s.units[k];
  for (const key of Object.keys(s.prices)) if (key.startsWith(`${k}|`)) delete s.prices[key];
}

// ---- step 3
const drivers = (u: Unit) => u.drivers.filter(d => passes(props.charge, props.s, d.when, showAll.value));
const hiddenDrivers = (u: Unit) => u.drivers.filter(d => !passes(props.charge, props.s, d.when, showAll.value));
const chosen = (k: string) => new Set(chosenDriverIds(props.s.units[k], showAll.value));
function pickDriver(k: string, id: string | null) {
  const us = edit().units[k];
  if (showAll.value) {
    const set = new Set(chosenDriverIds(us, true));
    if (id) set.has(id) ? set.delete(id) : set.add(id);
    us.drivers = [...set];
  } else us.driver = id;
}
const setCalc = (k: string, d: string, v: string) => { const us = edit().units[k]; us.calc = { ...(us.calc ?? {}), [d]: v }; };
const setMin = (k: string, m: string | null) => (edit().units[k].min = m);
const setSecond = (k: string, v: boolean) => (edit().units[k].second = v);
// factor values the chosen driver does not apply to (e.g. Palletized when pricing by case count)
const outside = (u: Unit, k: string) => {
  if (showAll.value) return [];
  const act = activeConds(props.charge, props.s);
  return drivers(u).filter(d => chosen(k).has(d.id)).flatMap(d => Object.entries(d.when).flatMap(([k, allowed]) =>
    (act.find(x => x.cond.id === k)?.values ?? []).filter(v => !allowed.includes(v))));
};
const setFlatOtherwise = (k: string, v: boolean) => (edit().units[k].flatOtherwise = v);
const setSetting = (id: string, v: string) => (edit().settings[id] = v);
const toggleLocalAll = () => { const s = edit(); s.showAll = !s.showAll; };
</script>

<template>
  <div class="bb">
    <!-- 1. rate factors -->
    <section class="step">
      <div class="q"><span class="num">1</span>{{ T.t("e.step1") }}</div>
      <div class="chips">
        <button v-for="cd in condShown" :key="cd.id" class="chip" :class="{ sel: s.conds[cd.id]?.on }" :title="T.tc(cd.help)"
                :disabled="readOnly" @click="toggleCond(cd)">{{ T.tc(cd.label) }}</button>
        <button v-if="hiddenConds" class="btn ghost sm" @click="moreConds = true">{{ T.t("e.moreFactors", { n: hiddenConds }) }}</button>
      </div>
      <div v-for="cd in ticked" :key="cd.id" class="vals">
        <div class="lbl">
          {{ T.t("e.valuesQ", { label: T.tc(cd.label) }) }}
          <template v-if="!cd.free && !readOnly">
            <button class="btn ghost sm" @click="setAll(cd, true)">{{ T.t("e.selectAll") }}</button>
            <button class="btn ghost sm" @click="setAll(cd, false)">{{ T.t("e.clear") }}</button>
          </template>
        </div>
        <input v-if="cd.free" class="input free" :value="s.conds[cd.id].text ?? ''" :placeholder="T.t('e.freeTextPh')" :readonly="readOnly"
               @change="setText(cd, ($event.target as HTMLInputElement).value)" />
        <div v-else class="chips">
          <button v-for="v in cd.values" :key="v" class="chip sm" :class="{ sel: s.conds[cd.id].values.includes(v) }" :disabled="readOnly"
                  @click="toggleVal(cd, v)">{{ T.tc(v) }}</button>
        </div>
        <div v-if="!withValues.has(cd.id)" class="note warn">{{ T.t("e.noValues") }}</div>
      </div>
    </section>

    <!-- billing settings (no separate price) -->
    <section v-if="charge.settings.length" class="step">
      <div class="q"><span class="num">·</span>{{ T.t("e.settings") }}</div>
      <div v-for="st in charge.settings" :key="st.id" class="row">
        <span class="k">{{ T.tc(st.label) }}</span>
        <select class="input" :value="s.settings[st.id] || st.options[0]" :disabled="readOnly" @change="setSetting(st.id, ($event.target as HTMLSelectElement).value)">
          <option v-for="o in st.options" :key="o" :value="o">{{ T.tc(o) }}</option>
        </select>
      </div>
    </section>

    <!-- 2. units -->
    <section class="step">
      <div class="q"><span class="num">2</span>{{ T.t("e.step2") }}</div>
      <div class="chips">
        <button v-for="u in unitsShown" :key="u.id" class="chip" :class="{ sel: s.units[u.id]?.on }" :disabled="readOnly" @click="toggleUnit(u)">{{ T.tc(u.label) }}</button>
        <button v-if="allowed.length > unitsShown.length" class="btn ghost sm" @click="moreUnits = true">{{ T.t("e.moreUnits", { n: allowed.length - unitsShown.length }) }}</button>
      </div>
      <div v-if="ruleHidden.length" class="note info">{{ T.t("e.hiddenBy", { list: ruleHidden.map(u => T.tc(u.label)).join(", ") }) }}</div>
      <div v-if="!activeU.length" class="note warn">{{ T.t("e.noUnit") }}</div>
    </section>

    <!-- 3. pricing per unit -->
    <section v-if="activeU.length" class="step">
      <div class="q"><span class="num">3</span>{{ T.t("e.step3") }}</div>
      <div v-for="{ key: k, unit: u, n } in activeU" :key="k" class="unit">
        <div class="uhead">
          <h4>{{ T.t("e.perUnit", { unit: softLower(T.tc(u.label)) }) }}<span v-if="methodsOf(u) > 1" class="muted"> · {{ T.t("e.method", { n }) }}</span></h4>
          <template v-if="!readOnly">
            <button v-if="n > 1" class="btn ghost sm" @click="removeMethod(k)">{{ T.t("e.remove") }}</button>
            <button v-else-if="u.drivers.length" class="btn ghost sm" @click="addMethod(u)">+ {{ T.t("e.addMethod") }}</button>
          </template>
        </div>
        <div v-if="u.drivers.length" class="row">
          <span class="k">{{ T.t("e.varies") }}</span>
          <div class="chips">
            <button v-if="!showAll" class="chip sm" :class="{ sel: !s.units[k].driver }" :disabled="readOnly" @click="pickDriver(k, null)">{{ T.t("e.flat") }}</button>
            <button v-for="d in drivers(u)" :key="d.id" class="chip sm" :class="{ sel: chosen(k).has(d.id) }" :title="T.tc(d.help)" :disabled="readOnly"
                    @click="pickDriver(k, d.id)">{{ T.tc(d.label) }}<span v-if="d.kind === 'volume'" class="muted"> · {{ T.t("e.volume") }}</span></button>
          </div>
        </div>
        <div v-if="hiddenDrivers(u).length" class="note info">{{ T.t("e.notApplicable", { list: hiddenDrivers(u).map(d => T.tc(d.label)).join(", ") }) }}</div>
        <div v-if="outside(u, k).length" class="row">
          <span class="k">{{ T.t("e.flatOtherwise", { values: [...new Set(outside(u, k))].map(v => T.tc(v)).join(", ") }) }}</span>
          <div class="chips">
            <button class="chip sm" :class="{ sel: !s.units[k].flatOtherwise }" :disabled="readOnly" @click="setFlatOtherwise(k, false)">{{ T.t("e.notPriced") }}</button>
            <button class="chip sm" :class="{ sel: !!s.units[k].flatOtherwise }" :disabled="readOnly" @click="setFlatOtherwise(k, true)">{{ T.t("e.flat") }}</button>
          </div>
        </div>
        <div v-for="d in u.drivers.filter(x => x.calc && chosen(k).has(x.id))" :key="'c' + d.id" class="row">
          <span class="k">{{ T.t("e.tiers", { label: T.tc(d.label) }) }}</span>
          <div class="chips">
            <button v-for="o in ['range', 'incremental']" :key="o" class="chip sm" :class="{ sel: (s.units[k].calc?.[d.id] ?? 'range') === o }"
                    :disabled="readOnly" @click="setCalc(k, d.id, o)">{{ T.t(`e.calc.${o}`) }}</button>
          </div>
        </div>
        <div v-if="u.mins.length" class="row">
          <span class="k">{{ T.t("e.minimum") }}</span>
          <div class="chips">
            <button class="chip sm" :class="{ sel: !s.units[k].min }" :disabled="readOnly" @click="setMin(k, null)">{{ T.t("e.none") }}</button>
            <button v-for="m in u.mins" :key="m" class="chip sm" :class="{ sel: s.units[k].min === m }" :disabled="readOnly"
                    @click="setMin(k, m)">{{ T.t("e.minPer", { basis: T.t(`basis.${m}`) }) }}</button>
          </div>
        </div>
        <div v-if="u.second" class="row">
          <span class="k">{{ T.t("e.second") }}</span>
          <div class="chips">
            <button class="chip sm" :class="{ sel: !s.units[k].second }" :disabled="readOnly" @click="setSecond(k, false)">{{ T.t("c.no") }}</button>
            <button class="chip sm" :class="{ sel: !!s.units[k].second }" :disabled="readOnly" @click="setSecond(k, true)">{{ T.t("c.yes") }}</button>
          </div>
        </div>
        <RateTable :charge="charge" :unit="u" :unit-key="k" :s="s" :show-all="showAll" :read-only="readOnly" />
        <div v-if="u.note" class="hint">{{ T.tc(u.note) }}</div>
      </div>
    </section>

    <button v-if="!readOnly" class="btn ghost sm" @click="toggleLocalAll">{{ s.showAll ? T.t("e.guided") : T.t("e.showAllCharge") }}</button>
  </div>
</template>

<style scoped>
.bb { padding: 0 16px 16px 50px; }
.step { margin: 10px 0 16px; }
.q { font-weight: 600; margin-bottom: 8px; display: flex; align-items: baseline; gap: 8px; }
.num { color: var(--primary-text); font-variant-numeric: tabular-nums; font-weight: 700; min-width: 14px; }
.vals { margin: 10px 0 8px 22px; }
.vals .lbl { font-size: 13px; color: var(--muted-fg); margin-bottom: 6px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.free { width: min(360px, 100%); }
.unit { border-left: 2px solid var(--border); padding: 2px 0 6px 16px; margin: 14px 0 14px 22px; }
.unit h4 { margin: 0; font-size: 14px; }
.uhead { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
.k { font-size: 13px; color: var(--muted-fg); min-width: 160px; }
@media (max-width: 700px) { .bb { padding-left: 16px; } .k { min-width: 0; width: 100%; } .vals, .unit { margin-left: 0; } }
</style>
