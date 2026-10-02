// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createApp, nextTick } from "vue";
import App from "./App.vue";

const tick = async () => { await nextTick(); await nextTick(); };
const btn = (text: string) => [...document.querySelectorAll("button")].find(b => b.textContent!.trim().replace(/^✓\s*/, "").startsWith(text)) as HTMLButtonElement;
const h2 = () => document.querySelector("h2")!.textContent!.trim();

describe("guided quote end to end", () => {
  it("walks a D2C shipper through and creates the quote", async () => {
    try { window.localStorage.clear(); } catch { /* node's own localStorage may shadow jsdom's */ }
    history.replaceState(null, "", "/?wizard&lang=en");
    document.body.innerHTML = '<div id="app"></div>';
    createApp(App).mount("#app");
    await tick();
    expect(h2()).toBe("Let's start with you");
    expect(btn("Next").disabled).toBe(true);
    const input = document.querySelector("input")!;
    input.value = "Kite Goods"; input.dispatchEvent(new Event("input")); await tick();
    btn("Next").click(); await tick();
    expect(h2()).toBe("Who do you sell to?");
    btn("Consumers online").click(); await tick();
    const crumbs = [...document.querySelectorAll(".crumbs li")].map(l => l.textContent!.trim());
    expect(crumbs).toContain("Online orders");
    expect(crumbs).not.toContain("Business orders");
    btn("Next").click(); await tick();   // site
    btn("Next").click(); await tick();   // inbound
    btn("Small parcel deliveries").click(); await tick();
    btn("Next").click(); await tick();
    expect(h2()).toBe("How should we store it?");
    expect(document.querySelector(".opt.sel")!.textContent).toContain("Bins and shelves");   // suggested from parcel + D2C
    btn("Next").click(); await tick();
    expect(h2()).toBe("Where do you sell online?");
    btn("Shopify").click(); await tick();
    btn("Next").click(); await tick();
    expect(h2()).toBe("How are your orders picked?");
    expect(document.body.textContent).not.toContain("Full pallets");
    btn("Next").click(); await tick();
    btn("No, or very rarely").click(); await tick();
    btn("Next").click(); await tick();
    expect(h2()).toBe("Anything extra?");
    btn("Next").click(); await tick();
    expect(h2()).toBe("Review and create your quote");
    btn("Create my quote").click(); await tick();
    expect(document.querySelector(".wiz")).toBeNull();
    expect(document.body.textContent).toContain("created from your answers");
    expect(document.body.textContent).toContain("Kite Goods");
    expect(location.search).toBe("?lang=en");
  });
});
