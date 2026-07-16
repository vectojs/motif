import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMOS } from "../src/registry";

const CATEGORIES = new Set(["controls", "layout", "effects", "3d-xr"]);

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const demosRoot = join(here, "..", "src", "demos");
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const d of DEMOS) {
    if (seen.has(d.id)) errors.push(`duplicate id: ${d.id}`);
    seen.add(d.id);
    if (!CATEGORIES.has(d.category))
      errors.push(`${d.id}: invalid category "${d.category}"`);
    if (!existsSync(join(demosRoot, d.id, "demo.js")))
      errors.push(`${d.id}: missing src/demos/${d.id}/demo.js`);
    if (!existsSync(join(demosRoot, d.id, "index.html")))
      errors.push(`${d.id}: missing src/demos/${d.id}/index.html`);
  }

  if (errors.length > 0) {
    console.error("check:registry FAILED:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(`check:registry OK — ${DEMOS.length} demo(s) validated.`);
}

main();
