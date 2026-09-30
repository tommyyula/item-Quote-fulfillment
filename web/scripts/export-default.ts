// Writes the default template rate sheet as Excel (EN + ZH) for sharing outside the app.
// Run: npx vite-node scripts/export-default.ts <outDir>
import { writeFileSync } from "node:fs";
import catalogJson from "../src/data/catalog.json";
import { translator } from "../src/i18n";
import { buildExcel } from "../src/lib/export";
import { buildProposal } from "../src/lib/proposal";
import type { Catalog, QuoteData } from "../src/lib/types";

const cat = catalogJson as unknown as Catalog;
const out = process.argv[2] ?? ".";
const data: QuoteData = {
  header: { title: "Default template: most common charges", facility: "", effectiveDate: new Date().toISOString().slice(0, 10),
            validDays: 90, preparedBy: "", notes: "" },
  selections: JSON.parse(JSON.stringify(cat.defaultPreset)),
};
const quote = { id: "default", number: "TEMPLATE", customerId: "", createdAt: "", updatedAt: "", status: "draft" as const, draft: data, versions: [] };
for (const lang of ["en", "zh"] as const) {
  const buf = await buildExcel(cat, buildProposal(cat, data), { quote, customer: null, data, versionLabel: "Default" }, translator(lang));
  const file = `${out}/UNIS Default Rate Sheet (${lang.toUpperCase()}).xlsx`;
  writeFileSync(file, Buffer.from(buf));
  console.log("wrote", file);
}
