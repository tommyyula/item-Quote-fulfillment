<script setup lang="ts">
// Progressive questions for a builder charge: factors -> units -> price driver / minimum / additional-unit rate -> rate table.
import { computed, ref } from "vue";
import { useApp } from "../lib/context";
import { activeConds, chosenDriverIds, passes } from "../lib/engine";
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
const activeU = computed(() => props.charge.units.filter(u => props.s.units[u.id]?.on && passes(props.charge, props.s, u.when, showAll.value)));

// ---- step 3
const drivers = (u: Unit) => u.drivers.filter(d => passes(props.charge, props.s, d.when, showAll.value));
const hiddenDrivers = (u: Unit) => u.drivers.filter(d => !passes(props.charge, props.s, d.when, showAll.value));
const chosen = (u: Unit) => new Set(chosenDriverIds(props.s.units[u.id], showAll.value));
function pickDriver(u: Unit, id: string | null) {
  const us = edit().units[u.id];
  if (showAll.value) {
    const set = new Set(chosenDriverIds(us, true));
    if (id) set.has(id) ? set.delete(id) : set.add(id);
    us.drivers = [...set];
  } else us.driver = id;
}
const setCalc = (u: Unit, d: string, v: string) => { const us = edit().units[u.id]; us.calc = { ...(us.calc ?? {}), [d]: v }; };
const setMin = (u: Unit, m: string | null) => (edit().units[u.id].min = m);
const setSecond = (u: Unit, v: boolean) => (edit().units[u.id].second = v);
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
      <div v-for="u in activeU" :key="u.id" class="unit">
        <h4>{{ T.t("e.perUnit", { unit: softLower(T.tc(u.label)) }) }}</h4>
        <div v-if="u.drivers.length" class="row">
          <span class="k">{{ T.t("e.varies") }}</span>
          <div class="chips">
            <button v-if="!showAll" class="chip sm" :class="{ sel: !s.units[u.id].driver }" :disabled="readOnly" @click="pickDriver(u, null)">{{ T.t("e.flat") }}</button>
            <button v-for="d in drivers(u)" :key="d.id" class="chip sm" :class="{ sel: chosen(u).has(d.id) }" :title="T.tc(d.help)" :disabled="readOnly"
                    @click="pickDriver(u, d.id)">{{ T.tc(d.label) }}<span v-if="d.kind === 'volume'" class="muted"> · {{ T.t("e.volume") }}</span></button>
          </div>
        </div>
        <div v-if="hiddenDrivers(u).length" class="note info">{{ T.t("e.notApplicable", { list: hiddenDrivers(u).map(d => T.tc(d.label)).join(", ") }) }}</div>
        <div v-for="d in u.drivers.filter(x => x.calc && chosen(u).has(x.id))" :key="'c' + d.id" class="row">
          <span class="k">{{ T.t("e.tiers", { label: T.tc(d.label) }) }}</span>
          <div class="chips">
            <button v-for="o in ['range', 'incremental']" :key="o" class="chip sm" :class="{ sel: (s.units[u.id].calc?.[d.id] ?? 'range') === o }"
                    :disabled="readOnly" @click="setCalc(u, d.id, o)">{{ T.t(`e.calc.${o}`) }}</button>
          </div>
        </div>
        <div v-if="u.mins.length" class="row">
          <span class="k">{{ T.t("e.minimum") }}</span>
          <div class="chips">
            <button class="chip sm" :class="{ sel: !s.units[u.id].min }" :disabled="readOnly" @click="setMin(u, null)">{{ T.t("e.none") }}</button>
            <button v-for="m in u.mins" :key="m" class="chip sm" :class="{ sel: s.units[u.id].min === m }" :disabled="readOnly"
                    @click="setMin(u, m)">{{ T.t("e.minPer", { basis: T.t(`basis.${m}`) }) }}</button>
          </div>
        </div>
        <div v-if="u.second" class="row">
          <span class="k">{{ T.t("e.second") }}</span>
          <div class="chips">
            <button class="chip sm" :class="{ sel: !s.units[u.id].second }" :disabled="readOnly" @click="setSecond(u, false)">{{ T.t("c.no") }}</button>
            <button class="chip sm" :class="{ sel: !!s.units[u.id].second }" :disabled="readOnly" @click="setSecond(u, true)">{{ T.t("c.yes") }}</button>
          </div>
        </div>
        <RateTable :charge="charge" :unit="u" :s="s" :show-all="showAll" :read-only="readOnly" />
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
.unit h4 { margin: 0 0 8px; font-size: 14px; }
.row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
.k { font-size: 13px; color: var(--muted-fg); min-width: 160px; }
@media (max-width: 700px) { .bb { padding-left: 16px; } .k { min-width: 0; width: 100%; } .vals, .unit { margin-left: 0; } }
</style>
