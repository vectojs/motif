import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMOS, CATEGORIES } from '../src/registry';

const VALID = new Set<string>(CATEGORIES.map((c) => c.category));

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const demosRoot = join(here, '..', 'src', 'demos');
  const errors: string[] = [];
  const seen = new Set<string>();

  // Catches a stale generated-meta.ts: a folder with meta.ts that `inline:sources`
  // hasn't picked up yet (forgot to rerun the generator before this check).
  const demoIds = new Set(DEMOS.map((d) => d.id));
  if (existsSync(demosRoot)) {
    for (const entry of readdirSync(demosRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (existsSync(join(demosRoot, entry.name, 'meta.ts')) && !demoIds.has(entry.name)) {
        errors.push(
          `${entry.name}: has meta.ts but is missing from the registry — run "bun run inline:sources"`,
        );
      }
    }
  }

  for (const d of DEMOS) {
    if (seen.has(d.id)) errors.push(`duplicate id: ${d.id}`);
    seen.add(d.id);
    if (!VALID.has(d.category)) errors.push(`${d.id}: invalid category "${d.category}"`);
    if (!existsSync(join(demosRoot, d.id, 'demo.ts')))
      errors.push(`${d.id}: missing src/demos/${d.id}/demo.ts`);
    if (!existsSync(join(demosRoot, d.id, 'index.html')))
      errors.push(`${d.id}: missing src/demos/${d.id}/index.html`);
    if (!existsSync(join(demosRoot, d.id, 'meta.ts')))
      errors.push(`${d.id}: missing src/demos/${d.id}/meta.ts`);
  }

  if (errors.length > 0) {
    console.error('check:registry FAILED:');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(`check:registry OK — ${DEMOS.length} demo(s) validated.`);
}

main();
