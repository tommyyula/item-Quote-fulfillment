import { createApp } from "vue";
import App from "./App.vue";
import PublicStart from "./PublicStart.vue";
import SignIn from "./components/SignIn.vue";
import { loadBootstrap, serverMode } from "./lib/remote";
import { createStore } from "./lib/store";
import "./styles/app.css";

async function start() {
  // the public guided quote (/start, or ?start where the host has no rewrites): no sign-in, no app data loaded
  if (/\/start$/.test(location.pathname) || new URLSearchParams(location.search).has("start")) return createApp(PublicStart).mount("#app");
  if (!serverMode) return createApp(App).mount("#app");   // browser-only demo (GitHub Pages)
  try {
    const boot = await loadBootstrap();
    if (!boot) return createApp(SignIn).mount("#app");
    createApp(App, { store: createStore(undefined, boot) }).mount("#app");
  } catch (e) {
    console.error(e);
    createApp(SignIn, { loadError: true }).mount("#app");
  }
}
start();
