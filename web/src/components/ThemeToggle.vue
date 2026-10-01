<script setup lang="ts">
// Day / night switch as a small icon: the icon shows the view a click switches to (sun -> day view, moon -> night view).
defineProps<{ theme: "light" | "dark"; label: string }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <button type="button" class="theme-toggle" :title="label" :aria-label="label" @click="$emit('toggle')">
    <svg v-if="theme === 'dark'" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
      </g>
    </svg>
    <svg v-else viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 21.2 15.4a.6.6 0 0 0-.7-.8Z" />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0;
  border: 1px solid var(--border); border-radius: var(--radius-sm, 8px); background: var(--card); color: var(--fg); cursor: pointer;
}
.theme-toggle:hover { border-color: var(--muted-fg); color: var(--primary-text); }
.theme-toggle:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
</style>
