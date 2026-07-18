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

    // Resize-redistribution regression check: scene.resize() only changes
    // the canvas/backing-store dimensions, not entity positions — demos
    // whose own fit() only calls scene.resize() (rather than actively
    // repositioning entities from the new width/height) shrink-then-grow
    // into a clustered sub-region instead of spreading back across the
    // full area. Constellation Lines and Mercury Blobs both hit this
    // (2026-07-18); their fit() now rescales positions proportionally —
    // this locks that in for every future viewport-toggle cycle.
    console.log(`\n[resize] Responsive -> 360 -> Responsive redistribution`);
    for (const [route, iframePath, preClick, buckets] of [
      ["effects/constellation-lines", "/demos/constellation-lines/", null, 10],
      // Mercury Blobs defaults to 6 entities — with only 6 finite-radius
      // circles, a 10-bucket check is flaky by chance alone (random spawn
      // positions can legitimately leave 1-2 of 10 buckets uncovered even
      // with the resize fix in place, independent of the bug). Switch to
      // the 12-blob tier first for a denser, less sample-flaky check, and
      // use 5 buckets instead of 10 — still wide enough margin against the
      // real bug's signature (0% coverage across 60% of buckets).
      ["materials/mercury-blobs", "/demos/mercury-blobs/", "#btn-count-12", 5],
    ] as const) {
      const rp = await browser.newPage({
        viewport: { width: 1300, height: 850 },
        deviceScaleFactor: 1,
      });
      await rp.goto(`${BASE}/${route}/`, { waitUntil: "load" });
      await rp.waitForTimeout(600);
      if (preClick) {
        const frameForPreclick = rp
          .frames()
          .find((f) => f.url().includes(iframePath));
        await frameForPreclick!.locator(preClick).click();
        await rp.waitForTimeout(400);
      }
      await rp.locator('[data-vp="360"]').click();
      await rp.waitForTimeout(600);
      await rp.locator('[data-vp="fluid"]').click();
      await rp.waitForTimeout(600);
      const frame = rp.frames().find((f) => f.url().includes(iframePath));
      // A canvas-space histogram of visible (non-background) pixels across
      // 10 equal-width buckets. This is a proxy for entity-position spread,
      // verified against a direct per-entity x-coordinate readout (a
      // temporary window.__points/__blobs debug hook) while diagnosing the
      // original bug: the clustering bug left roughly 60% of buckets
      // COMPLETELY empty (all content confined to the sub-region the
      // entities occupied at the narrow width), not merely pixel-poor — so
      // requiring every bucket to hold a MEANINGFUL share (not just
      // count>0) is what actually catches it.
      //
      // Constellation Lines enables `pointBackend: 'webgl'`, which makes
      // Scene create a SEPARATE overlay `<canvas>` appended after the
      // original one and does all point drawing there — the original
      // `#canvas` element stays visually blank. `document.querySelector
      // ("canvas")` returns the FIRST canvas in DOM order (the blank one),
      // so reading pixels from it is a false negative regardless of the
      // real bug state; every canvas must be checked and the one with
      // actual non-background content used.
      const spread = await frame!.evaluate((BUCKETS: number) => {
        const canvases = Array.from(
          document.querySelectorAll("canvas"),
        ) as HTMLCanvasElement[];
        const bg = [0xf7, 0xf4, 0xee]; // --void
        let best: number[] | null = null;
        let bestTotal = -1;
        for (const canvas of canvases) {
          const ctx = canvas.getContext("2d");
          if (!ctx) continue; // a WebGL-context canvas: getContext('2d') is null
          const { width, height } = canvas;
          if (width === 0 || height === 0) continue;
          const { data } = ctx.getImageData(0, 0, width, height);
          const buckets = new Array(BUCKETS).fill(0);
          for (let y = 0; y < height; y += 3) {
            for (let x = 0; x < width; x += 3) {
              const i = (y * width + x) * 4;
              // A canvas that's blank because pointBackend:'webgl' routes
              // all drawing to a SEPARATE overlay canvas reads back as
              // fully transparent (alpha=0) here, not the page's --void
              // color — treating only exact-bg-color pixels as
              // "background" mis-flagged every pixel of that blank canvas
              // as "content", producing a uniform-looking false positive
              // that hid the real clustering bug during triage.
              const alpha = data[i + 3];
              const isBg =
                alpha === 0 ||
                (Math.abs(data[i] - bg[0]) < 6 &&
                  Math.abs(data[i + 1] - bg[1]) < 6 &&
                  Math.abs(data[i + 2] - bg[2]) < 6);
              if (!isBg)
                buckets[
                  Math.min(BUCKETS - 1, Math.floor((x / width) * BUCKETS))
                ]++;
            }
          }
          const total = buckets.reduce((s, n) => s + n, 0);
          if (total > bestTotal) {
            bestTotal = total;
            best = buckets;
          }
        }
        return best;
      }, buckets);
      const total = spread ? spread.reduce((s, n) => s + n, 0) : 0;
      // Every bucket must hold at least 2% of total content pixels — the
      // measured buggy distribution put 0% in over half the buckets, so
      // this threshold has wide margin against both the real bug and
      // ordinary rendering noise (anti-aliasing, glow/blur radii, line
      // endpoints) or a sparse-entity-count sampling fluke.
      const minShare = total * 0.02;
      check(
        !!spread && total > 0 && spread.every((n) => n >= minShare),
        `${route}: content spread across all ${buckets} buckets after resize cycle, each >=2% of ${total} total (${JSON.stringify(spread)})`,
      );
      await rp.close();
    }
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
