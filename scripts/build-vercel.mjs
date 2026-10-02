// Vercel build (Build Output API v3): the web app as static files + the API bundled into a single Node function.
// Bundling keeps the function independent of how Vercel would compile loose TypeScript files.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const out = ".vercel/output";
rmSync(out, { recursive: true, force: true });

execSync("npm run build --prefix web", { stdio: "inherit" });
cpSync("web/dist", `${out}/static`, { recursive: true });

const fn = `${out}/functions/api.func`;
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ["server/vercel.ts"], outfile: `${fn}/index.js`,
  bundle: true, platform: "node", target: "node24", format: "cjs", sourcemap: true, logLevel: "info",
});
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({
  runtime: "nodejs24.x", handler: "index.js", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 30,
}, null, 2));

const security = { "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Content-Type-Options": "nosniff" };
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: "/(.*)", headers: security, continue: true },
    { src: "/docs", status: 307, headers: { Location: "/api/index.html" } },
    { handle: "filesystem" },
    // /api/ itself and /api/openapi.* are the static API docs; these prefixes are the live API
    { src: "/api/(v1|auth|health|public)(.*)", dest: "/api" },
    // the public guided quote (no sign-in) is the same single-page app
    { src: "/start/", status: 308, headers: { Location: "/start" } },   // index.html loads ./assets relative to the path
    { src: "/start", dest: "/index.html" },
  ],
}, null, 2));
console.log("Build output ready");
