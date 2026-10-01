<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const onKey = (e: KeyboardEvent) => e.key === "Escape" && emit("close");
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="scrim no-print" @click.self="emit('close')">
    <aside class="drawer" :class="{ wide }" role="dialog" :aria-label="title">
      <header><h3>{{ title }}</h3><button class="btn ghost" @click="emit('close')" aria-label="Close">×</button></header>
      <div class="content"><slot /></div>
    </aside>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .55); z-index: 50; display: flex; justify-content: flex-end; }
.drawer { width: min(460px, 100vw); height: 100%; background: var(--card); border-left: 1px solid var(--border); display: flex; flex-direction: column; }
.drawer.wide { width: min(760px, 100vw); }
header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
header h3 { margin: 0; font-size: 16px; }
.content { overflow: auto; padding: 14px 18px 24px; flex: 1; }
</style>
