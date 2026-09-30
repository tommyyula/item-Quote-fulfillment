<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useApp } from "../lib/context";
import { dateText } from "../lib/format";
import type { Customer } from "../lib/types";
import Drawer from "./Drawer.vue";

const emit = defineEmits<{ close: [] }>();
const { store, T } = useApp();
const query = ref("");
const expanded = ref<string | null>(store.customer.value?.id ?? null);
const editing = ref<Partial<Customer> | null>(null);
const error = ref("");

const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  return store.state.customers.filter(c => !q || [c.company, c.contact, c.code, c.email, c.city].some(x => x?.toLowerCase().includes(q)));
});
const quotesOf = (id: string) => store.state.quotes.filter(q => q.customerId === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

function startNew() {
  editing.value = reactive({ company: "", contact: "", phone: "", email: "", address: "", city: "", state: "", zip: "", code: "", channel: "Both" as const });
  error.value = "";
}
function startEdit(c: Customer) {
  editing.value = reactive({ ...c });
  error.value = "";
}
function save() {
  if (!editing.value?.company?.trim()) { error.value = T.value.t("cu.required"); return; }
  const c = store.saveCustomer(editing.value as Customer);
  expanded.value = c.id;
  editing.value = null;
}
function open(id: string) {
  store.openQuote(id);
  emit("close");
}
function create(customerId: string) {
  store.createQuote(customerId);
  emit("close");
}
const fields = ["company", "code", "contact", "phone", "email", "address", "city", "state", "zip"] as const;
</script>

<template>
  <Drawer :title="T.t('cu.title')" @close="emit('close')">
    <template v-if="editing">
      <h4>{{ editing.id ? T.t("cu.edit") : T.t("cu.new") }}</h4>
      <div class="form">
        <label v-for="f in fields" :key="f" :class="{ wide: f === 'company' || f === 'address' }">
          <span>{{ T.t(`cu.${f}`) }}</span><input class="input" v-model="(editing as any)[f]" />
        </label>
        <label>
          <span>{{ T.t("cu.channel") }}</span>
          <select class="input" v-model="editing.channel"><option>Both</option><option>B2B</option><option>D2C</option></select>
        </label>
      </div>
      <div v-if="error" class="note warn">{{ error }}</div>
      <div class="actions"><button class="btn primary" @click="save">{{ T.t("c.save") }}</button><button class="btn" @click="editing = null">{{ T.t("c.cancel") }}</button></div>
    </template>
    <template v-else>
      <div class="top">
        <input class="input" v-model="query" :placeholder="T.t('c.search')" />
        <button class="btn primary" @click="startNew">＋ {{ T.t("cu.new") }}</button>
      </div>
      <p v-if="!list.length" class="muted">{{ T.t("cu.empty") }}</p>
      <div v-for="cu in list" :key="cu.id" class="cust" :class="{ current: cu.id === store.customer.value?.id }">
        <div class="row" @click="expanded = expanded === cu.id ? null : cu.id">
          <div>
            <div class="name">{{ cu.company }} <span class="badge" :class="cu.channel">{{ cu.channel }}</span></div>
            <div class="hint">{{ [cu.code, cu.contact, cu.city && `${cu.city}, ${cu.state}`].filter(Boolean).join(" · ") }}</div>
          </div>
          <span class="hint">{{ T.t("cu.quotes", { n: quotesOf(cu.id).length }) }}</span>
        </div>
        <div v-if="expanded === cu.id" class="quotes">
          <div v-for="q in quotesOf(cu.id)" :key="q.id" class="q" @click="open(q.id)">
            <span><b>{{ q.number }}</b> {{ q.draft.header.title }}</span>
            <span class="hint">{{ T.t(`status.${q.status}`) }} · {{ q.versions.length ? `v${q.versions.at(-1)!.v}` : T.t("h.draft") }} · {{ dateText(q.updatedAt, T) }}</span>
          </div>
          <p v-if="!quotesOf(cu.id).length" class="hint">{{ T.t("cu.noQuotes") }}</p>
          <div class="actions">
            <button class="btn sm primary" @click="create(cu.id)">＋ {{ T.t("cu.createQuote") }}</button>
            <button class="btn sm" @click="startEdit(cu)">{{ T.t("c.edit") }}</button>
          </div>
        </div>
      </div>
    </template>
  </Drawer>
</template>

<style scoped>
.top { display: flex; gap: 8px; margin-bottom: 12px; }
.top .input { flex: 1; }
.cust { border: 1px solid var(--line); border-radius: 8px; margin-bottom: 8px; }
.cust.current { border-color: var(--brand-2); }
.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; }
.name { font-weight: 600; }
.quotes { border-top: 1px solid var(--line); padding: 8px 12px 10px; background: var(--panel-2); }
.q { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; flex-wrap: wrap; }
.q:hover { background: var(--soft); }
.actions { display: flex; gap: 8px; margin-top: 10px; }
.form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.form label { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: var(--muted); }
.form label.wide { grid-column: span 2; }
</style>
