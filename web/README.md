# UNIS Quote webform

Vue 3 + Vite + TypeScript. The rate catalog (`src/data/catalog.json`) is generated from the billing data by
`scripts/rate-catalog/build_v3.py` (source of truth: `scripts/rate-catalog/model_v3.py`).

```bash
npm install
npm run dev        # http://localhost:5180
npm test           # engine, proposal merge and Excel export tests
npm run build      # static site in dist/ (relative paths - works on GitHub Pages or a file share)
```

Regenerate the catalog after editing `model_v3.py`: `python3 scripts/rate-catalog/build_v3.py` (from the repo root).

## Structure
- `src/lib/engine.ts` – show/hide rules and rate-row generation for charge builders (pure, unit-tested)
- `src/lib/proposal.ts` – customer rate sheet: template sections, same-price rows merged, single-value factors lifted into the heading
- `src/lib/store.ts` – customers, quotes (draft + immutable versions), history, preferences; persisted via a `Repo` (localStorage today, swap for an API)
- `src/lib/export.ts` – Excel (proposal layout + raw "Rate lines" sheet with system charge codes) and JSON export; printing uses `@media print`
- `src/i18n/` – UI strings (`messages.ts`) and catalog translations (`catalog.<lang>.json`) for EN / 中文 / 日本語 / ES

## URL options
`?lang=zh|ja|es|en` · `?theme=dark|light` · `?plang=<lang>` (proposal language) · `?view=proposal` (rate sheet only) · `#proposal`

## Charge-code mapback
`src/lib/codemap.ts` resolves every rate line to an existing billing-system charge code plus the system conditions to configure
(status `mapped` / `new-condition` / `new-item`). The save-version dialog runs the check and each version stores the mapback.
Mapping tables live in `scripts/rate-catalog/model_v3.py` (`BUILDER_CODES`, `SIMPLE_CODES`, `NEW_ITEM_NAMES`, `COND_SYSTEM`, `DRIVER_SYSTEM`).
`npx vite-node scripts/export-mapback.ts <outDir>` writes the setup list (new items, new conditions, full code map) to Excel.

## API
OpenAPI 3.1 contract: `public/api/openapi.yaml` (bundled to `openapi.json`, rendered at `api/index.html` with Redoc).
Lint: `npx @redocly/cli lint public/api/openapi.yaml`. `src/lib/openapi.test.ts` keeps the schemas in step with the app's objects.

## Privacy
The catalog is published with the site. `build_v3.py` fails if any customer name from the price list would end up in it;
the business data folders (`workingfolder-input/`, `workingfolder-output/`) are git-ignored.
