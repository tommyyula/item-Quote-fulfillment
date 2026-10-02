<script setup lang="ts">
// Guided quote for someone quoting once: one simple question per page, later pages shaped by earlier answers.
import { computed, nextTick, reactive, ref, watch } from "vue";
import { LANGS, type Lang } from "../i18n";
import { useApp } from "../lib/context";
import { quoteLines } from "../lib/engine";
import { money, unitText } from "../lib/format";
import { catalog, localRepo } from "../lib/store";
import type { BuilderCharge } from "../lib/types";
import {
  B2B_SHIP, emptyAnswers, extraOptions, PLATFORMS, pickOptions, prefill, RETAILERS, stepComplete, suggestedPick, suggestedStorage,
  visibleSteps, wizardSelections, type Arrival, type PickKind, type StepId, type StorageKind, type WizardAnswers,
} from "../lib/wizard";
import ThemeToggle from "./ThemeToggle.vue";

const emit = defineEmits<{ exit: []; done: [number: string] }>();
const { store, T } = useApp();
const st = store.state;

// progress survives a reload: a one-time visitor should not lose their answers
const saved = localRepo.load<{ a: WizardAnswers; step: StepId } | null>("wizard", null);
const a = reactive<WizardAnswers>({ ...emptyAnswers(), ...saved?.a });
const step = ref<StepId>(saved?.step ?? "company");
watch([a, step], () => localRepo.save("wizard", { a, step: step.value }), { deep: true });

const steps = computed(() => visibleSteps(a));
const idx = computed(() => Math.max(0, steps.value.indexOf(step.value)));
const canNext = computed(() => stepComplete(step.value, a));
const heading = ref<HTMLElement | null>(null);

function go(to: StepId) {
  if (!a.touched.includes(to)) {
    Object.assign(a, prefill(to, a));
    a.touched.push(to);
  }
  step.value = to;
  nextTick(() => heading.value?.focus());
}
const next = () => { if (canNext.value && idx.value < steps.value.length - 1) go(steps.value[idx.value + 1]); };
const back = () => { if (idx.value > 0) go(steps.value[idx.value - 1]); };
function onEnter(e: KeyboardEvent) {
  // Enter in a text field moves on; on an option button it keeps selecting that option
  if ((e.target as HTMLElement).tagName !== "INPUT" || step.value === "review") return;
  e.preventDefault();
  next();
}

// answers that later steps are suggested from: changing them re-suggests those steps when next opened
const forget = (...ids: StepId[]) => (a.touched = a.touched.filter(x => !ids.includes(x as StepId)));
function setChannel(c: WizardAnswers["channel"]) {
  if (a.channel !== c) forget("storage", "b2b", "pick", "extras");
  a.channel = c;
}
function toggle<T>(list: T[], v: T) {
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
  else list.push(v);
}
function toggleArrival(v: Arrival) {
  toggle(a.arrival, v);
  forget("storage");
}

const facilities = (catalog.categories[1].charges[0] as BuilderCharge).conds.find(c => c.id === "facility")!.values;
const storageKinds: StorageKind[] = ["pallet", "bin", "each", "sqft"];
const arrivals: Arrival[] = ["floor", "pallet", "parcel"];
const sugStorage = computed(() => suggestedStorage(a));
const sugPick = computed(() => suggestedPick(a));
const extras = computed(() => extraOptions(catalog, a));

// review
const selections = computed(() => wizardSelections(a));
const lineCount = computed(() => quoteLines(catalog, { header: { title: "", facility: "", effectiveDate: "", validDays: 90, preparedBy: "", notes: "" },
                                                       selections: selections.value }).length);
const quoted = computed(() => catalog.categories
  .map(cat => ({ cat, charges: cat.charges.filter(c => selections.value[c.id]?.on) }))
  .filter(x => x.charges.length));
const list = (xs: string[]) => (xs.length ? xs.map(x => T.value.tc(x)).join(", ") : T.value.t("w.rv.none"));
const summary = computed((): { step: StepId; text: string }[] => {
  const t = T.value;
  const rows: { step: StepId; text: string }[] = [
    { step: "company", text: [a.company, a.contact, a.email].filter(Boolean).join(" · ") },
    { step: "channel", text: a.channel ? t.t(`w.ch.${a.channel}`) : "" },
    { step: "site", text: `${a.facility ? t.tc(a.facility) : t.t("w.site.unsure")} · ${t.t(`w.temp.${a.temperature}`)}` },
    { step: "inbound", text: a.arrival.map(x => t.t(`w.arr.${x}`)).join(", ") },
    { step: "storage", text: a.storage.map(x => t.t(`w.st.${x}`)).join(", ") },
  ];
  if (steps.value.includes("b2b")) rows.push({ step: "b2b", text: `${list(a.b2bShip)} · ${list(a.retailers)}` });
  if (steps.value.includes("d2c")) rows.push({ step: "d2c", text: list(a.platforms) });
  rows.push(
    { step: "pick", text: a.pick.filter(p => pickOptions(a).includes(p)).map(x => t.t(`w.pk.${x}`)).join(", ") },
    { step: "returns", text: a.returns ? t.t("w.yes") : t.t("w.no") },
    { step: "extras", text: a.extras.length ? a.extras.map(id => t.tc(catalog.categories.flatMap(c => c.charges).find(c => c.id === id)?.name)).join(", ") : t.t("w.rv.none") },
  );
  return rows;
});

function create() {
  const customer = store.saveCustomer({ company: a.company.trim(), contact: a.contact.trim(), email: a.email.trim(), phone: a.phone.trim(),
                                        channel: a.channel || "Both" });
  const q = store.createQuote(customer.id);
  q.draft.header.title = T.value.t("w.title", { company: customer.company });
  q.draft.header.facility = a.facility;
  q.draft.selections = wizardSelections(a);
  store.touch();
  localRepo.save("wizard", null);
  emit("done", q.number);
}
function exit() {
  emit("exit");
}
const setLang = (l: Lang) => (st.prefs.lang = l);
const toggleTheme = () => (st.prefs.theme = st.prefs.theme === "light" ? "dark" : "light");
</script>

<template>
  <div class="wiz" @keydown.enter="onEnter">
    <header class="wtop">
      <div class="brand">
        <span class="org">{{ T.t("app.brand") }}</span>
        <strong>{{ T.t("w.start") }}</strong>
      </div>
      <span class="sp"></span>
      <div class="seg" role="group" aria-label="Language">
        <button v-for="l in LANGS" :key="l.id" :class="{ on: st.prefs.lang === l.id }" :aria-pressed="st.prefs.lang === l.id" @click="setLang(l.id)">{{ l.label }}</button>
      </div>
      <ThemeToggle :theme="st.prefs.theme" :label="st.prefs.theme === 'light' ? T.t('h.nightView') : T.t('h.dayView')" @toggle="toggleTheme" />
      <button class="btn ghost sm" @click="exit">{{ T.t("w.exit") }}</button>
    </header>

    <div class="progress" role="progressbar" :aria-valuenow="idx + 1" :aria-valuemin="1" :aria-valuemax="steps.length" :aria-label="T.t('w.step', { n: idx + 1, total: steps.length })">
      <div class="bar" :style="{ width: `${((idx + 1) / steps.length) * 100}%` }"></div>
    </div>

    <main id="main" class="stage">
      <ol class="crumbs" aria-label="Steps">
        <li v-for="(s, i) in steps" :key="s" :class="{ cur: s === step, done: i < idx }">
          <button v-if="i < idx" class="crumb" @click="go(s)">{{ T.t(`w.s.${s}`) }}</button>
          <span v-else class="crumb" :aria-current="s === step ? 'step' : undefined">{{ T.t(`w.s.${s}`) }}</span>
        </li>
      </ol>
      <p class="count">{{ T.t("w.step", { n: idx + 1, total: steps.length }) }}</p>

      <section class="card" :key="step">
        <!-- 1. who -->
        <template v-if="step === 'company'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.company.q") }}</h2>
          <p class="sub">{{ T.t("w.company.hint") }}</p>
          <div class="form">
            <label class="wide"><span>{{ T.t("cu.company") }} *</span><input class="input" v-model="a.company" autocomplete="organization" autofocus /></label>
            <label><span>{{ T.t("cu.contact") }}</span><input class="input" v-model="a.contact" autocomplete="name" /></label>
            <label><span>{{ T.t("cu.email") }}</span><input class="input" type="email" v-model="a.email" autocomplete="email" /></label>
            <label><span>{{ T.t("cu.phone") }}</span><input class="input" type="tel" v-model="a.phone" autocomplete="tel" /></label>
          </div>
        </template>

        <!-- 2. B2B / D2C: decides which order questions follow -->
        <template v-else-if="step === 'channel'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.channel.q") }}</h2>
          <p class="sub">{{ T.t("w.channel.hint") }}</p>
          <div class="opts" role="radiogroup">
            <button v-for="c in (['B2B', 'D2C', 'Both'] as const)" :key="c" class="opt" role="radio" :aria-checked="a.channel === c" :class="{ sel: a.channel === c }" @click="setChannel(c)">
              <strong>{{ T.t(`w.ch.${c}`) }}</strong><span>{{ T.t(`w.ch.${c}.d`) }}</span>
            </button>
          </div>
        </template>

        <!-- 3. where -->
        <template v-else-if="step === 'site'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.site.q") }}</h2>
          <p class="sub">{{ T.t("w.site.hint") }}</p>
          <div class="chips big" role="radiogroup">
            <button v-for="f in ['', ...facilities]" :key="f" class="chip" role="radio" :aria-checked="a.facility === f" :class="{ sel: a.facility === f }" @click="a.facility = f">
              {{ f ? T.tc(f) : T.t("w.site.unsure") }}
            </button>
          </div>
          <h3>{{ T.t("w.temp.q") }}</h3>
          <div class="chips big" role="radiogroup">
            <button v-for="t in (['dry', 'cooler', 'both'] as const)" :key="t" class="chip" role="radio" :aria-checked="a.temperature === t" :class="{ sel: a.temperature === t }" @click="a.temperature = t">
              {{ T.t(`w.temp.${t}`) }}
            </button>
          </div>
        </template>

        <!-- 4. receiving -->
        <template v-else-if="step === 'inbound'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.in.q") }}</h2>
          <p class="sub">{{ T.t("w.pickAll") }}</p>
          <div class="opts">
            <button v-for="x in arrivals" :key="x" class="opt" role="checkbox" :aria-checked="a.arrival.includes(x)" :class="{ sel: a.arrival.includes(x) }" @click="toggleArrival(x)">
              <strong>{{ T.t(`w.arr.${x}`) }}</strong><span>{{ T.t(`w.arr.${x}.d`) }}</span>
            </button>
          </div>
        </template>

        <!-- 5. storage: suggested from how goods arrive -->
        <template v-else-if="step === 'storage'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.st.q") }}</h2>
          <p class="sub">{{ T.t("w.st.hint") }}</p>
          <div class="opts">
            <button v-for="x in storageKinds" :key="x" class="opt" role="checkbox" :aria-checked="a.storage.includes(x)" :class="{ sel: a.storage.includes(x) }" @click="toggle(a.storage, x)">
              <strong>{{ T.t(`w.st.${x}`) }}<span v-if="sugStorage.includes(x)" class="tag ok">{{ T.t("w.suggested") }}</span></strong>
              <span>{{ T.t(`w.st.${x}.d`) }}</span>
            </button>
          </div>
        </template>

        <!-- 6a. B2B orders -->
        <template v-else-if="step === 'b2b'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.b2b.q") }}</h2>
          <h3>{{ T.t("w.b2b.ship") }} <span class="hint">{{ T.t("w.pickAll") }}</span></h3>
          <div class="chips big">
            <button v-for="x in B2B_SHIP" :key="x" class="chip" role="checkbox" :aria-checked="a.b2bShip.includes(x)" :class="{ sel: a.b2bShip.includes(x) }" @click="toggle(a.b2bShip, x)">{{ T.tc(x) }}</button>
          </div>
          <h3>{{ T.t("w.b2b.ret") }}</h3>
          <p class="hint">{{ T.t("w.b2b.retHint") }}</p>
          <div class="chips big">
            <button v-for="x in RETAILERS" :key="x" class="chip" role="checkbox" :aria-checked="a.retailers.includes(x)" :class="{ sel: a.retailers.includes(x) }" @click="toggle(a.retailers, x)">{{ T.tc(x) }}</button>
          </div>
        </template>

        <!-- 6b. D2C orders -->
        <template v-else-if="step === 'd2c'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.d2c.q") }}</h2>
          <p class="sub">{{ T.t("w.d2c.hint") }}</p>
          <div class="chips big">
            <button v-for="x in PLATFORMS" :key="x" class="chip" role="checkbox" :aria-checked="a.platforms.includes(x)" :class="{ sel: a.platforms.includes(x) }" @click="toggle(a.platforms, x)">{{ T.tc(x) }}</button>
          </div>
        </template>

        <!-- 7. picking: full pallets only offered to B2B -->
        <template v-else-if="step === 'pick'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.pick.q") }}</h2>
          <p class="sub">{{ T.t("w.pick.hint") }}</p>
          <div class="opts">
            <button v-for="x in pickOptions(a)" :key="x" class="opt" role="checkbox" :aria-checked="a.pick.includes(x)" :class="{ sel: a.pick.includes(x) }" @click="toggle(a.pick, x as PickKind)">
              <strong>{{ T.t(`w.pk.${x}`) }}<span v-if="sugPick.includes(x)" class="tag ok">{{ T.t("w.suggested") }}</span></strong>
              <span>{{ T.t(`w.pk.${x}.d`) }}</span>
            </button>
          </div>
        </template>

        <!-- 8. returns: wording follows the channel -->
        <template v-else-if="step === 'returns'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.rt.q") }}</h2>
          <div class="opts" role="radiogroup">
            <button class="opt" role="radio" :aria-checked="a.returns === true" :class="{ sel: a.returns === true }" @click="a.returns = true">
              <strong>{{ T.t("w.rt.yes") }}</strong><span>{{ T.t(`w.rt.yes.${a.channel || 'Both'}`) }}</span>
            </button>
            <button class="opt" role="radio" :aria-checked="a.returns === false" :class="{ sel: a.returns === false }" @click="a.returns = false">
              <strong>{{ T.t("w.rt.no") }}</strong><span>{{ T.t("w.rt.no.d") }}</span>
            </button>
          </div>
        </template>

        <!-- 9. extras: only services that fit the channel, recommended from earlier answers -->
        <template v-else-if="step === 'extras'">
          <h2 ref="heading" tabindex="-1">{{ T.t("w.ex.q") }}</h2>
          <p class="sub">{{ T.t("w.ex.hint") }}</p>
          <div class="opts list">
            <button v-for="x in extras" :key="x.charge.id" class="opt row" role="checkbox" :aria-checked="a.extras.includes(x.charge.id)" :class="{ sel: a.extras.includes(x.charge.id) }" @click="toggle(a.extras, x.charge.id)">
              <strong>{{ T.tc(x.charge.name) }}<span v-if="x.recommended" class="tag ok">{{ T.t("w.recommended") }}</span></strong>
              <span>{{ T.tc(x.charge.desc) }}</span>
              <span class="price">{{ T.t("w.ex.from", { price: money(x.charge.default), unit: unitText(x.charge.unit, T) }) }}</span>
            </button>
          </div>
        </template>

        <!-- 10. review -->
        <template v-else>
          <h2 ref="heading" tabindex="-1">{{ T.t("w.rv.q") }}</h2>
          <div class="review">
            <div>
              <h3>{{ T.t("w.rv.answers") }}</h3>
              <dl>
                <template v-for="r in summary" :key="r.step">
                  <dt>{{ T.t(`w.s.${r.step}`) }}</dt>
                  <dd>{{ r.text }} <button class="btn ghost sm" @click="go(r.step)">{{ T.t("c.edit") }}</button></dd>
                </template>
              </dl>
            </div>
            <div>
              <h3>{{ T.t("w.rv.quote") }}</h3>
              <p class="hint">{{ T.t("w.rv.lines", { n: lineCount }) }}</p>
              <div v-for="g in quoted" :key="g.cat.id" class="qgroup">
                <h4>{{ T.tc(g.cat.name) }}</h4>
                <ul><li v-for="c in g.charges" :key="c.id">{{ T.tc(c.name) }}</li></ul>
              </div>
            </div>
          </div>
          <p class="sub">{{ T.t("w.rv.after") }}</p>
        </template>
      </section>

      <nav class="acts" aria-label="Wizard">
        <button v-if="idx > 0" class="btn" @click="back">{{ T.t("w.back") }}</button>
        <span class="sp"></span>
        <span v-if="step !== 'review' && canNext" class="hint enter">{{ T.t("w.enterHint") }}</span>
        <button v-if="step !== 'review'" class="btn primary lg" :disabled="!canNext" @click="next">{{ T.t("w.next") }}</button>
        <button v-else class="btn primary lg" @click="create">{{ T.t("w.create") }}</button>
      </nav>
    </main>
  </div>
</template>

<style scoped>
.wiz { min-height: 100vh; display: flex; flex-direction: column; }
.wtop { display: flex; align-items: center; gap: 10px; padding: 10px 20px; background: var(--sidebar); border-bottom: 1px solid var(--border); }
.brand { display: flex; flex-direction: column; line-height: 1.15; }
.brand .org { font-size: 12px; color: var(--muted-fg); }
.brand strong { font-size: 17px; }
.sp { flex: 1; }
.progress { height: 3px; background: var(--muted); }
.progress .bar { height: 100%; background: var(--primary); transition: width .25s ease; }
.stage { width: min(760px, 100%); margin: 0 auto; padding: 28px 16px 60px; }
.crumbs { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 0; margin: 0 0 6px; font-size: 12.5px; }
.crumb { background: none; border: 0; padding: 0; color: var(--muted-fg); }
button.crumb { cursor: pointer; color: var(--primary-text); }
button.crumb:hover { text-decoration: underline; }
.crumbs .cur .crumb { color: var(--fg); font-weight: 600; }
.count { color: var(--muted-fg); font-size: 12.5px; margin: 0 0 14px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; animation: in .2s ease; }
@keyframes in { from { opacity: 0; transform: translateY(6px); } }
h2 { font-size: 24px; margin: 0 0 6px; outline: none; }
h3 { font-size: 15px; margin: 22px 0 8px; }
.sub { color: var(--muted-fg); margin: 0 0 18px; }
.form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--muted-fg); }
.form .wide { grid-column: span 2; }
.form .input { padding: 9px 11px; font-size: 15px; }
.opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.opts.list { grid-template-columns: 1fr; }
.opt { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left; padding: 14px 16px; border: 1px solid var(--border);
  border-radius: var(--radius); background: transparent; cursor: pointer; }
.opt:hover { border-color: var(--muted-fg); }
.opt strong { font-size: 15px; display: flex; align-items: baseline; flex-wrap: wrap; }
.opt > span { color: var(--muted-fg); font-size: 13px; }
.opt.sel { border-color: var(--primary); background: var(--primary-soft); }
.opt.sel strong::before { content: "✓ "; color: var(--primary-text); margin-right: 4px; }
.opt .price { color: var(--fg); font-variant-numeric: tabular-nums; font-size: 12.5px; }
.chips.big .chip { padding: 8px 14px; font-size: 14px; }
.acts { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
.btn.lg { padding: 9px 22px; font-size: 15px; }
.enter { font-size: 12px; }
.review { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.review h3 { margin-top: 8px; }
dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: 13.5px; }
dt { color: var(--muted-fg); }
dd { margin: 0; }
.qgroup h4 { margin: 10px 0 2px; font-size: 13px; color: var(--muted-fg); }
.qgroup ul { margin: 0; padding-left: 18px; font-size: 13.5px; }
@media (max-width: 640px) {
  .card { padding: 20px 16px; }
  .form, .review { grid-template-columns: 1fr; }
  .form .wide { grid-column: auto; }
  .enter { display: none; }
}
</style>
