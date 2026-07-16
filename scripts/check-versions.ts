import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMOS } from "../src/registry";

/**
 * Parse a demo's authored `index.html` and return the `@vectojs/*` versions its
 * importmap pins, read straight from the `esm.sh/@vectojs/<pkg>@<ver>` URLs.
 * The importmap is the single source of truth for what actually runs, so this
 * reads it verbatim rather than trusting the registry `packages` metadata.
 */
export function extractImportmapVersions(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const block = html.match(
    /<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!block) return out;
  let imports: Record<string, string>;
  try {
    imports =
      (JSON.parse(block[1]) as { imports?: Record<string, string> }).imports ??
      {};
  } catch {
    return out;
  }
  for (const url of Object.values(imports)) {
    const m = url.match(/esm\.sh\/(@vectojs\/[^@]+)@([^/?"]+)/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/**
 * Cross-check one demo. Two invariants: every `@vectojs/*` version its
 * importmap pins must equal the repo's declared dependency version, and the
 * demo's registry `packages` set must exactly equal the `@vectojs/*` set the
 * importmap pins (so metadata never drifts from what runs).
 */
export function checkDemoVersions(
  id: string,
  html: string,
  packages: string[],
  deps: Record<string, string>,
): string[] {
  const errors: string[] = [];
  const pinned = extractImportmapVersions(html);

  for (const [pkg, ver] of Object.entries(pinned)) {
    const want = deps[pkg];
    if (want === undefined)
      errors.push(
        `${id}: importmap pins ${pkg}@${ver} but it is not a repo dependency`,
      );
    else if (want !== ver)
      errors.push(`${id}: importmap pins ${pkg}@${ver}, repo declares ${want}`);
  }

  const vectoPackages = packages.filter((p) => p.startsWith("@vectojs/"));
  const pinnedSet = new Set(Object.keys(pinned));
  for (const p of vectoPackages)
    if (!pinnedSet.has(p))
      errors.push(
        `${id}: packages lists ${p} but its importmap does not pin it`,
      );
  for (const p of pinnedSet)
    if (!vectoPackages.includes(p))
      errors.push(`${id}: importmap pins ${p} but packages does not list it`);

  return errors;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const deps: Record<string, string> = {};
  for (const [name, spec] of Object.entries(pkg.dependencies ?? {}))
    if (name.startsWith("@vectojs/")) deps[name] = spec.replace(/^[\^~]/, "");

  const demosRoot = join(root, "src", "demos");
  const errors: string[] = [];
  for (const d of DEMOS) {
    const htmlPath = join(demosRoot, d.id, "index.html");
    if (!existsSync(htmlPath)) continue;
    errors.push(
      ...checkDemoVersions(
        d.id,
        readFileSync(htmlPath, "utf8"),
        d.packages,
        deps,
      ),
    );
  }

  if (errors.length > 0) {
    console.error("check:versions FAILED:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  const n = existsSync(demosRoot) ? readdirSync(demosRoot).length : 0;
  console.log(
    `check:versions OK — importmaps lockstep with repo deps (${n} demo dir(s)).`,
  );
}

if (import.meta.main) main();
