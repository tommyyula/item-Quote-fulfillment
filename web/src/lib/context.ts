import { computed, inject, provide, type ComputedRef, type InjectionKey } from "vue";
import { translator, type Translator } from "../i18n";
import type { Store } from "./store";

interface AppCtx { store: Store; T: ComputedRef<Translator>; PT: ComputedRef<Translator> }
const KEY: InjectionKey<AppCtx> = Symbol("app");

export function provideApp(store: Store) {
  const T = computed(() => translator(store.state.prefs.lang));
  // proposal language can differ from the UI language (e.g. Chinese UI, English proposal)
  const PT = computed(() => translator(store.state.prefs.proposalLang || store.state.prefs.lang));
  const ctx = { store, T, PT };
  provide(KEY, ctx);
  return ctx;
}
export function useApp(): AppCtx {
  const ctx = inject(KEY);
  if (!ctx) throw new Error("app context missing");
  return ctx;
}
