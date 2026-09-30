<script setup lang="ts">
import { computed, ref } from "vue";
import { useApp } from "../lib/context";
import { dateTimeText } from "../lib/format";
import type { HistoryEvent } from "../lib/types";
import Drawer from "./Drawer.vue";

const emit = defineEmits<{ close: [] }>();
const { store, T } = useApp();
const filter = ref<"all" | "quote" | "customer">("all");

const quoteById = computed(() => Object.fromEntries(store.state.quotes.map(q => [q.id, q])));
const custById = computed(() => Object.fromEntries(store.state.customers.map(c => [c.id, c])));
const events = computed(() => store.state.history.filter(e =>
  filter.value === "all" || (filter.value === "quote" ? e.quoteId === store.quote.value?.id : e.customerId === store.customer.value?.id)).slice(0, 200));
// recently viewed quotes: unique, newest first
const recent = computed(() => {
  const seen = new Set<string>();
  return store.state.history.filter(e => e.type === "view" && e.quoteId && quoteById.value[e.quoteId] && !seen.has(e.quoteId) && seen.add(e.quoteId))
    .slice(0, 8).map(e => quoteById.value[e.quoteId!]);
});
function text(e: HistoryEvent) {
  const q = e.quoteId ? quoteById.value[e.quoteId]?.number ?? "" : "";
  const c = e.customerId ? custById.value[e.customerId]?.company ?? "" : "";
  const detail = e.type === "status" && e.detail ? T.value.t(`status.${e.detail}`) : e.detail ?? "";
  return T.value.t(`hi.${e.type}`, { q, c, detail });
}
function open(id: string) {
  store.openQuote(id);
  emit("close");
}
</script>

<template>
  <Drawer :title="T.t('hi.title')" @close="emit('close')">
    <h4>{{ T.t("hi.recent") }}</h4>
    <div class="recent">
      <button v-for="q in recent" :key="q.id" class="btn sm" @click="open(q.id)">{{ q.number }} · {{ custById[q.customerId]?.company }}</button>
    </div>
    <div class="chips filt">
      <button class="chip sm" :class="{ sel: filter === 'all' }" @click="filter = 'all'">{{ T.t("hi.all") }}</button>
      <button class="chip sm" :class="{ sel: filter === 'quote' }" @click="filter = 'quote'">{{ T.t("hi.thisQuote") }}</button>
      <button class="chip sm" :class="{ sel: filter === 'customer' }" @click="filter = 'customer'">{{ T.t("hi.thisCustomer") }}</button>
    </div>
    <p v-if="!events.length" class="muted">{{ T.t("hi.empty") }}</p>
    <ul class="ev">
      <li v-for="e in events" :key="e.id">
        <span class="t">{{ dateTimeText(e.ts, T) }}</span>
        <span>{{ text(e) }}</span>
        <button v-if="e.quoteId && quoteById[e.quoteId] && e.quoteId !== store.quote.value?.id" class="btn ghost sm" @click="open(e.quoteId)">{{ T.t("c.open") }}</button>
      </li>
    </ul>
  </Drawer>
</template>

<style scoped>
.recent { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.filt { margin-bottom: 10px; }
.ev { list-style: none; padding: 0; margin: 0; }
.ev li { display: flex; gap: 10px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; flex-wrap: wrap; }
.t { color: var(--muted); font-size: 12px; min-width: 150px; }
</style>
