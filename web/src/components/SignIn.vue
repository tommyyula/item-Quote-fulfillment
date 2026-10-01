<script setup lang="ts">
// Server mode, signed out: company sign-in (Microsoft Entra ID). Local development may also offer a dev sign-in.
import { computed, onMounted, ref } from "vue";
import itemLogoDark from "../assets/brand/item-white-logo.svg";
import itemLogoLight from "../assets/brand/item-logo-fullcolor-blacktxt.svg";
import { LANGS, translator, type Lang } from "../i18n";
import ThemeToggle from "./ThemeToggle.vue";
import { api, authConfig, signInUrl, type AuthConfig } from "../lib/remote";
import { localRepo, type Prefs } from "../lib/store";

defineProps<{ loadError?: boolean }>();
const prefs = localRepo.load<Partial<Prefs>>("prefs", {});
const nav = (navigator.language || "en").slice(0, 2);
const lang = ref<Lang>(prefs.lang ?? ((["en", "zh", "ja", "es"].includes(nav) ? nav : "en") as Lang));
const theme = ref<"light" | "dark">(prefs.theme ?? "dark");
document.documentElement.dataset.theme = theme.value;
function toggleTheme() {
  theme.value = theme.value === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = theme.value;
  localRepo.save("prefs", { ...localRepo.load<Partial<Prefs>>("prefs", {}), theme: theme.value });   // same preference the app uses
}
const T = computed(() => translator(lang.value));
const cfg = ref<AuthConfig | null>(null);
const email = ref("");
const error = ref(new URLSearchParams(location.search).get("signin_error") ?? "");

onMounted(async () => {
  document.title = `UNIS ${T.value.t("app.title")}`;
  try {
    cfg.value = await authConfig();
  } catch {
    error.value = T.value.t("s.loadError");
  }
});
const reload = () => location.reload();
function setLang(l: Lang) {
  lang.value = l;
  localRepo.save("prefs", { ...localRepo.load<Partial<Prefs>>("prefs", {}), lang: l });
}
async function devLogin() {
  try {
    await api("POST", "/auth/dev-login", { email: email.value.trim() });
    location.reload();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <main class="signin">
    <div class="box">
      <span class="org">{{ T.t("app.brand") }}</span>
      <h1>{{ T.t("app.title") }}</h1>
      <template v-if="loadError">
        <p>{{ T.t("s.loadError") }}</p>
        <button class="btn primary" @click="reload">{{ T.t("s.retry") }}</button>
      </template>
      <template v-else-if="cfg">
        <h2>{{ T.t("s.signInTitle") }}</h2>
        <p class="muted">{{ T.t("s.signInBody", { domains: cfg.domains.map(d => `@${d}`).join(", ") }) }}</p>
        <a v-if="cfg.provider" class="btn primary big" :href="signInUrl()">{{ T.t("s.signIn") }}</a>
        <p v-else class="muted">{{ T.t("s.notConfigured") }}</p>
        <form v-if="cfg.devLogin" class="dev" @submit.prevent="devLogin">
          <label class="field"><span class="lbl">{{ T.t("s.devLogin") }} · {{ T.t("s.email") }}</span>
            <input v-model="email" class="input" type="email" required :placeholder="`name@${cfg.domains[0]}`" />
          </label>
          <button class="btn" type="submit">{{ T.t("c.open") }}</button>
        </form>
      </template>
      <p v-else class="muted">{{ T.t("s.loading") }}</p>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <div class="prefs">
        <div class="seg" role="group" aria-label="Language">
          <button v-for="l in LANGS" :key="l.id" :class="{ on: lang === l.id }" :aria-pressed="lang === l.id" @click="setLang(l.id)">{{ l.label }}</button>
        </div>
        <ThemeToggle :theme="theme" :label="theme === 'light' ? T.t('h.nightView') : T.t('h.dayView')" @toggle="toggleTheme" />
      </div>
    </div>
    <a class="item" href="https://item.com" target="_blank" rel="noopener">
      <span>{{ T.t("f.supported") }}</span>
      <img :src="theme === 'light' ? itemLogoLight : itemLogoDark" :alt="T.t('f.itemAlt')" width="120" height="47" />
    </a>
  </main>
</template>

<style scoped>
.signin { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; padding: 24px 16px; }
.box { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 14px; background: var(--card); border: 1px solid var(--border);
       border-radius: var(--radius, 12px); padding: 32px 28px; }
.org { color: var(--muted-fg); font-size: 13px; }
h1 { margin: 0; font-size: 28px; font-weight: 700; }
h2 { margin: 8px 0 0; font-size: 17px; font-weight: 600; }
p { margin: 0; }
.big { justify-content: center; padding: 10px 16px; font-size: 15px; text-decoration: none; }
.dev { display: flex; gap: 8px; align-items: flex-end; border-top: 1px solid var(--border); padding-top: 14px; }
.dev .field { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.lbl { font-size: 12px; color: var(--muted-fg); }
.err { color: var(--destructive); font-size: 13px; }
.prefs { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.item { display: inline-flex; align-items: center; gap: 10px; color: var(--muted-fg); font-size: 12px; text-decoration: none; }
</style>
