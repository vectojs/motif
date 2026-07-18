/**
 * Live-demo smoke test + visual capture for Motif. Uses the globally-installed
 * playwright + google-chrome-stable (no project dependency), mirroring
 * vectojs-website/scripts/test-utils.ts. Builds dist/ if missing, serves it
 * in-process via Bun.serve, then drives real Chrome:
 *   - each representative demo route mounts its iframe and PAINTS
 *     (iframe canvas.width>0) with no console/page errors;
 *   - switching demos removes the previous demo iframe (teardown contract);
 *   - shell + demo screenshot at desktop (1280) and narrow (390) widths is
 *     non-blank (dependency-free visual check — a true cross-machine pixel
 *     diff is too flaky for fonts/GL, so we assert the PNG isn't trivially
 *     empty and archive it under test/__screenshots__/).
 * Run with HTTPS_PROXY set so the demo iframes can fetch esm.sh modules.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, extname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = join(REPO_ROOT, "dist");
const SHOT_DIR = join(REPO_ROOT, "test", "__screenshots__");
const PORT = 8973;
const BASE = `http://127.0.0.1:${PORT}`;

// Every materials/effects demo (the showcase tier) plus one representative
// per remaining nav category (route = /<category>/<id>/).
const DEMOS = [
  { category: "materials", id: "liquid-glass" },
  { category: "materials", id: "ceramic" },
  { category: "materials", id: "jelly" },
  { category: "materials", id: "mercury-blobs" },
  { category: "effects", id: "glitch-text" },
  { category: "effects", id: "constellation-lines" },
  { category: "effects", id: "particle-text" },
];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".ico": "image/x-icon",
};

function sh(cmd: string): string {
  return execSync(cmd).toString().trim();
}

function loadPlaywright() {
  const pkgDir = dirname(sh('readlink -f "$(which playwright)"'));
  return createRequire(join(pkgDir, "package.json"))(pkgDir);
}

function serveDist() {
  // Always rebuild: a stale dist/ (e.g. missing a newly added public/ asset)
  // would let the smoke test pass or fail against code that no longer matches
  // source. The build also re-runs inline:sources so public/demos/ is current.
  execSync("bun run build", { cwd: REPO_ROOT, stdio: "inherit" });
  return Bun.serve({
    port: PORT,
    async fetch(req: Request) {
      const url = new URL(req.url);
      let path = url.pathname;
      if (path.endsWith("/")) path += "index.html";
      const file = Bun.file(join(DIST_DIR, path));
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            "content-type": MIME[extname(path)] ?? "application/octet-stream",
          },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });
}

// A same-origin capability fallback the engine logs when WebGPU is absent
// (headless Chrome has no GPU adapter) — expected, not a failure.
function isExpectedNoise(text: string): boolean {
  return (
    text.includes("Failed to initialize WebGPU:") &&
    (text.includes("No GPUAdapter found") ||
      text.includes("WebGPU not supported"))
  );
}

const failures: string[] = [];
function check(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ ${msg}`);
    failures.push(msg);
  }
}

async function main(): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  const server = serveDist();
  const pw = loadPlaywright();
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await pw.chromium.launch({
    headless: true,
    executablePath: sh('readlink -f "$(which google-chrome-stable)"'),
    args: [
      "--no-sandbox",
      "--use-gl=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
      "--enable-webgl2",
    ],
    ...(proxy
      ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } }
      : {}),
  });

  try {
    for (const demo of DEMOS) {
      const route = `${BASE}/${demo.category}/${demo.id}/`;
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      });
      const errors: string[] = [];
      page.on("console", (m: { type(): string; text(): string }) => {
        if (m.type() === "error" && !isExpectedNoise(m.text()))
          errors.push(m.text());
      });
      page.on("pageerror", (e: { message: string }) => errors.push(e.message));
      page.on("response", (r: { status(): number; url(): string }) => {
        if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
      });

      console.log(`\n[${demo.id}] ${route}`);
      await page.goto(route, { waitUntil: "load", timeout: 30000 });

      // Wait for the demo iframe's canvas to be sized (module executed).
      const frameSel = "iframe[data-demo-frame]";
      await page.waitForSelector(frameSel, { timeout: 15000 });
      let painted = false;
      for (let i = 0; i < 60 && !painted; i++) {
        const frame = page
          .frames()
          .find((f: { url(): string }) =>
            f.url().includes(`/demos/${demo.id}/`),
          );
        if (frame) {
          painted = await frame
            .evaluate(() => {
              const c = document.querySelector("canvas");
              return !!c && (c as HTMLCanvasElement).width > 0;
            })
            .catch(() => false);
        }
        if (!painted) await page.waitForTimeout(250);
      }
      check(painted, `${demo.id}: iframe canvas painted (width>0)`);
      check(errors.length === 0, `${demo.id}: no console/page errors`);
      if (errors.length) errors.forEach((e) => console.log(`      ! ${e}`));

      // Visual capture at desktop + narrow widths; assert non-blank.
      for (const w of [1280, 390]) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.waitForTimeout(300);
        const out = join(SHOT_DIR, `${demo.id}-${w}.png`);
        const buf = await page.screenshot({ path: out });
        check(
          buf.length > 5000,
          `${demo.id}@${w}: screenshot non-blank (${buf.length}B)`,
        );
      }
      await page.close();
    }

    // Teardown/isolation: one shell page, switch demos, prior iframe removed.
    console.log(`\n[teardown] iframe isolation across demo switch`);
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    await page.goto(`${BASE}/materials/liquid-glass/`, { waitUntil: "load" });
    await page.waitForSelector("iframe[data-demo-frame]");
    const firstSrc = await page.getAttribute("iframe[data-demo-frame]", "src");
    await page.goto(`${BASE}/effects/glitch-text/`, { waitUntil: "load" });
    await page.waitForSelector("iframe[data-demo-frame]");
    const frames = await page.$$("iframe[data-demo-frame]");
    const secondSrc = await page.getAttribute("iframe[data-demo-frame]", "src");
    check(
      frames.length === 1,
      "teardown: exactly one demo iframe after switch",
    );
    check(
      firstSrc === "/demos/liquid-glass/index.html" &&
        secondSrc === "/demos/glitch-text/index.html",
      "teardown: iframe src swapped to the new demo",
    );
    await page.close();
  } finally {
    await browser.close();
    server.stop(true);
  }

  console.log(
    `\n${failures.length === 0 ? "PASS" : "FAIL"} — ${DEMOS.length} demos, ${failures.length} failure(s)`,
  );
  if (failures.length) {
    writeFileSync(
      join(SHOT_DIR, "last-run-failures.txt"),
      failures.join("\n") + "\n",
    );
    process.exit(1);
  }
}

main();
