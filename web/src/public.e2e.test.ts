// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";

const sent: { path: string; body: { answers: Record<string, unknown> } }[] = [];
vi.mock("./lib/remote", async orig => ({
  ...(await orig<typeof import("./lib/remote")>()),
  serverMode: true,
  api: async (_m: string, path: string, body: { answers: Record<string, unknown> }) => {
    sent.push({ path, body });
    const { wizardSelections } = await import("./lib/wizard");
    return { etag: null, data: { number: "Q-2026-0042", customer: { id: "c1", company: body.answers.company, email: body.answers.email },
      draft: { header: { title: "t", facility: "", effectiveDate: "2026-10-01", validDays: 90, preparedBy: "", notes: "" },
               selections: wizardSelections(body.answers as never) } } };
  },
}));

const tick = async () => { await nextTick(); await nextTick(); await new Promise(r => setTimeout(r)); };
const btn = (text: string) => [...document.querySelectorAll("button")].find(b => b.textContent!.trim().replace(/^✓\s*/, "").startsWith(text)) as HTMLButtonElement;
const type = async (i: number, v: string) => {
  const el = document.querySelectorAll("input")[i] as HTMLInputElement;
  el.value = v; el.dispatchEvent(new Event("input")); await tick();
};

describe("public guided quote", () => {
  it("needs an e-mail, sends the answers and shows the rate sheet without internal exports", async () => {
    history.replaceState(null, "", "/start?lang=en");
    document.body.innerHTML = '<div id="app"></div>';
    const { default: PublicStart } = await import("./PublicStart.vue");
    createApp(PublicStart).mount("#app");
    await tick();
    expect(btn("Exit")).toBeUndefined();
    await type(0, "Kite Goods");
    expect(btn("Next").disabled).toBe(true);           // e-mail required on the public page
    await type(2, "sam@kite.example");
    btn("Next").click(); await tick();
    btn("Businesses and retailers").click(); await tick();
    btn("Next").click(); await tick();   // location
    btn("Next").click(); await tick();   // receiving
    btn("On pallets").click(); await tick();
    for (let i = 0; i < 6; i++) {
      if (document.querySelector("h2")!.textContent!.includes("returns")) { btn("No, or very rarely").click(); await tick(); }
      btn("Next").click(); await tick();
    }
    expect(document.querySelector("h2")!.textContent).toContain("Review");
    btn("Get my quote").click(); await tick(); await tick();
    expect(sent[0].path).toBe("/public/quote-requests");
    expect(sent[0].body.answers).toMatchObject({ company: "Kite Goods", email: "sam@kite.example", channel: "B2B" });
    expect(document.body.textContent).toContain("Q-2026-0042");
    expect(document.body.textContent).toContain("Warehouse Services Proposal");
    expect(btn("Export Excel")).toBeUndefined();
    expect(btn("Print / PDF")).toBeDefined();
  });
});
