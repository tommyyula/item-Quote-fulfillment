<script setup lang="ts">
// Money / percent input with benchmark awareness: marks edited values and values outside the typical range.
import { computed, ref, watch } from "vue";
import { useApp } from "../lib/context";
import { outOfRange } from "../lib/engine";

const props = defineProps<{ modelValue: number | null; benchmark: number | null; lo?: number; hi?: number; pct?: boolean; readonly?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [number | null] }>();
const { T } = useApp();

const show = (v: number | null) => (v == null ? "" : props.pct ? String(Math.round(v * 1000) / 10) : v.toFixed(2));
const text = ref(show(props.modelValue));
watch(() => props.modelValue, v => { if (document.activeElement !== el.value) text.value = show(v); });
const el = ref<HTMLInputElement>();

function commit() {
  const raw = text.value.replace(/[$,%\s]/g, "");
  if (raw === "") { emit("update:modelValue", null); return; }
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) { text.value = show(props.modelValue); return; }
  const v = props.pct ? n / 100 : Math.round(n * 100) / 100;
  emit("update:modelValue", v);
  text.value = show(v);
}
const range = computed(() => outOfRange(props.modelValue, props.lo, props.hi));
const edited = computed(() => props.modelValue != null && props.benchmark != null && Math.abs(props.modelValue - props.benchmark) > 1e-9);
const title = computed(() => [
  range.value === "low" ? T.value.t("e.low") : range.value === "high" ? T.value.t("e.high") : "",
  edited.value ? `${T.value.t("e.edited")} (${show(props.benchmark)}${props.pct ? "%" : ""})` : "",
].filter(Boolean).join(" · "));
</script>

<template>
  <span class="pi" :class="{ edited, [range || '']: !!range }" :title="title">
    <span class="pre" v-if="!pct">$</span>
    <input ref="el" v-model="text" inputmode="decimal" :readonly="readonly" :placeholder="T.t('e.enter')"
           @blur="commit" @keydown.enter="($event.target as HTMLInputElement).blur()" />
    <span class="post" v-if="pct">%</span>
    <span class="dot" v-if="edited || range" aria-hidden="true"></span>
  </span>
</template>

<style scoped>
.pi { position: relative; display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--input); padding: 0 7px; }
.pi:focus-within { outline: 2px solid var(--ring); outline-offset: 1px; }
.pi input { width: 78px; font-variant-numeric: tabular-nums; border: 0; background: transparent; text-align: right; padding: 4px 2px; outline: none; }
.pi .pre, .pi .post { color: var(--muted-fg); font-size: 12.5px; }
.pi.edited { border-color: var(--primary); }
.pi.low, .pi.high { border-color: var(--orange); background: var(--orange-soft); }
.dot { position: absolute; top: -3px; right: -3px; width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
.pi.low .dot, .pi.high .dot { background: var(--orange); }
</style>
