# Working on item-Quote-fulfillment

## Scope and layout

- `web/`: Vue 3 + Vite + TypeScript quotation UI; pricing, proposal and export logic in `web/src/lib/`.
- `server/`: Hono API, Drizzle schema/migrations, authentication and quote/customer routes.
- `scripts/rate-catalog/`: catalog generators; preserve the business-data exclusions in `.gitignore`.
- Use Node 24.x as declared in root `package.json`. Install root and web dependencies separately with `npm ci`.

## Checks

Run from the repository root:

```sh
npm test
npm run typecheck
npm --prefix web test
npm --prefix web run build
```

The API tests use isolated PGlite and production migrations; they do not require production database credentials. For UI changes, also run the local app and verify the affected flow in a browser. A build alone is not proof that a user flow works.

## Local development

- API: `npm run dev:api` on port 5182; without DATABASE_URL it uses local `.data/pglite`.
- Frontend: `npm --prefix web run dev` on port 5180 with `/api` proxy routes.
- Do not point experiments or tests at a production DATABASE_URL. Never expose the dev-login server publicly.

## pstack

Only activate pstack workflows when requested. Read the installed `poteto-mode/SKILL.md` and its relevant playbook, then read `~/.agents/pstack-models.md` before selecting any model. Local configured roles inherit the current authenticated Claude Code or Codex model; do not fall back to the upstream Grok/Opus model names if that file is missing. Report missing setup instead.

Use a new task branch or worktree. Define the acceptance check before changing behavior, test the changed boundary, and report actual results. Independent review can use the same model in a separate context; do not call it multi-model review. Commit/push/merge/deploy authority follows the user's task, not a skill's example prompt. Do not merge or deploy merely because tests pass.

Keep real customer names, prices, exports, credentials and `.env` files out of commits. Preserve existing ITEM visual conventions; use design.item.com for new UI patterns.

See `docs/PSTACK.md` for installation, launch commands and a first-task prompt.
