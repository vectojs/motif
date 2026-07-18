import { Scene, Entity, ComputeParticleEntity } from "@vectojs/core";

// Measures the Scene's REAL render cadence, not the display's vsync rate.
// An independent requestAnimationFrame loop fires every vsync tick
// regardless of whether Scene actually rendered that tick — on a 240Hz
// display it samples ~240 ticks/sec even while Scene.loop()'s own maxFPS
// cap renders only every 4th one, so a naive HUD would read "240fps" while
// the visible motion was genuinely capped at 60. Entity.update(dt) is only
// ever called from inside Scene's renderNode() walk, which is skipped
// entirely on a throttled/skipped tick — so a probe entity's own update()
// calls are a direct measurement of frames Scene actually rendered.
class FrameProbe extends Entity {
  frameTimes = [];
  isPointInside() {
    return false;
  }
  render() {}
  update(dt) {
    this.frameTimes.push(dt);
    // A window this small (~330ms at 60fps) still smooths ordinary
    // frame-to-frame noise, but doesn't let the average lag behind a real
    // fps transition — a larger window held onto stale throttled-fps
    // samples for roughly a full second after Scene un-throttled following
    // interaction, making the HUD under-report responsiveness for far
    // longer than the actual slowdown lasted.
    if (this.frameTimes.length > 20) this.frameTimes.shift();
  }
  avgFrameTime() {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
  }
}

// Particle text: two words the visitor chooses ("From"/"To"), each rasterized
// once into an offscreen canvas and sampled into a point cloud. Clicking
// Transform scatters the FROM shape outward and reforms it into the TO
// shape — the spring-to-origin physics built into ComputeParticleEntity is
// what holds each shape together and animates the reform.
//
// Gradient color: ComputeParticleEntity.baseColor is a single flat CSS
// color — there is no per-particle color hook in the engine. A visible
// gradient across the word is built by splitting the particle budget across
// several ComputeParticleEntity instances ("buckets"), each holding roughly
// an equal horizontal slice of the shape and painted a color interpolated
// between the two color pickers. More buckets read as a smoother gradient
// at the cost of one more Entity (and one more simulation pass) per bucket.
//
// Content projection: a separate, invisible Word entity always reports the
// TARGET word's real text via getContentProjection() — Ctrl+F, translation
// tools, and screen readers see real text throughout the scatter/reform
// cycle, never the literal particle positions. selectable is left at its
// default (false) rather than true: a projected-but-unselectable text layer
// still participates in Ctrl+F and accessibility, but doesn't intercept
// pointer events — with selectable: true, moving the mouse across the
// particle cloud kept triggering the browser's native text-selection drag
// instead of reaching the canvas underneath.

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");
const hud = document.getElementById("hud");
const panel = {
  origin: document.getElementById("input-origin"),
  target: document.getElementById("input-target"),
  transform: document.getElementById("btn-transform"),
  count: document.getElementById("input-count"),
  countValue: document.getElementById("value-count"),
  duration: document.getElementById("input-duration"),
  durationValue: document.getElementById("value-duration"),
  colorA: document.getElementById("input-color-a"),
  colorB: document.getElementById("input-color-b"),
};

const BUCKET_COUNT = 8;
const SAMPLE_CANVAS_H = 220;
// duration slider is in 0.1s steps (3..30 -> 0.3s..3.0s). Spring stiffness
// is tuned inversely against the selected duration below — the actual
// settle time depends on many factors (explosion force, word shape, canvas
// size), so this is a "feel" control (faster/stiffer vs slower/softer) that
// correlates loosely with the label, not a guaranteed-convergence timer.
const REFERENCE_DURATION_S = 1.2;
const REFERENCE_SPRING_K = 0.12;
const DAMPING = 0.7;

// Rasterize `text` and return up to `maxPoints` (x, y) samples of its
// opaque pixels, in the rasterizing canvas's own pixel space, along with the
// tight bounding box of those samples (so the caller can re-center them).
function sampleTextPoints(text, fontPx, maxPoints) {
  const safeText = text.trim() || " ";
  const probe = document.createElement("canvas");
  const pctx = probe.getContext("2d");
  const font = `900 ${fontPx}px "Inter", system-ui, sans-serif`;
  pctx.font = font;
  const width = Math.ceil(pctx.measureText(safeText).width) + 40;
  probe.width = width;
  probe.height = SAMPLE_CANVAS_H;
  pctx.font = font;
  pctx.fillStyle = "#000";
  pctx.textBaseline = "middle";
  pctx.fillText(safeText, 20, SAMPLE_CANVAS_H / 2);

  const { data } = pctx.getImageData(0, 0, width, SAMPLE_CANVAS_H);
  const candidates = [];
  // Grid step tuned so a typical word's opaque-pixel count lands near
  // maxPoints; oversample slightly then subsample evenly below, rather than
  // under-filling the particle budget on short words.
  const step = 2;
  for (let y = 0; y < SAMPLE_CANVAS_H; y += step) {
    for (let x = 0; x < width; x += step) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 128) candidates.push(x, y);
    }
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < candidates.length; i += 2) {
    const x = candidates[i];
    const y = candidates[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (candidates.length === 0) {
    minX = minY = 0;
    maxX = maxY = 1;
  }

  const nCandidates = candidates.length / 2;
  const keep = Math.min(maxPoints, nCandidates);
  const points = new Float32Array(Math.max(0, keep) * 2);
  const stride = keep > 0 ? nCandidates / keep : 1;
  for (let i = 0; i < keep; i++) {
    const srcIdx = Math.floor(i * stride) * 2;
    points[i * 2] = candidates[srcIdx] - minX;
    points[i * 2 + 1] = candidates[srcIdx + 1] - minY;
  }
  return { points, width: maxX - minX, height: maxY - minY };
}

// Invisible content-projection host: no drawImage/fillText of its own (the
// particles are the entire visual), but a real Entity in the tree so
// getContentProjection() gives Ctrl+F, translation tools, and screen
// readers the actual word — independent of however scattered the particle
// cloud currently is.
class Word extends Entity {
  constructor() {
    super("Word");
    this.text = "";
  }
  isPointInside() {
    return false;
  }
  render() {}
  getContentProjection() {
    return {
      text: this.text,
      font: '900 64px "Inter", system-ui, sans-serif',
      // Deliberately NOT selectable: true. A projected text layer with
      // selectable left at its default (false, meaning pointer-events:
      // none on the shadow element) still participates in Ctrl+F/
      // translation/screen readers, but doesn't intercept the mouse —
      // with selectable: true, moving the pointer across the word kept
      // starting the browser's native text-selection drag instead of
      // reaching the canvas underneath it.
    };
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

const scene = new Scene(canvas, {
  renderMode: "always", // particles are perpetually integrating
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

// One ComputeParticleEntity per gradient bucket. Sizes/colors are fixed at
// construction (maxParticles per bucket is recomputed and entities rebuilt
// whenever the particle-count slider changes — see rebuildBuckets()).
let buckets = [];
let word = null;
let frameProbe = null;

function currentSpringK() {
  const durationS = Number(panel.duration.value) / 10;
  return REFERENCE_SPRING_K * (REFERENCE_DURATION_S / durationS);
}

function rebuildBuckets(totalParticles) {
  for (const b of buckets) scene.remove(b);
  buckets = [];
  const perBucket = Math.max(1, Math.round(totalParticles / BUCKET_COUNT));
  const springK = currentSpringK();
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const t = BUCKET_COUNT === 1 ? 0 : i / (BUCKET_COUNT - 1);
    const color = lerpColor(panel.colorA.value, panel.colorB.value, t);
    const bucket = new ComputeParticleEntity({
      maxParticles: perBucket,
      size: 2.6,
      color,
      springK,
      damping: DAMPING,
      bounceDamping: 0.4,
      maxVelocity: 900,
    });
    scene.add(bucket);
    buckets.push(bucket);
  }
  seeded = false;
}

// Splits a word's sampled point cloud evenly across BUCKET_COUNT slices by
// HORIZONTAL position (left-to-right), so the gradient reads left-to-right
// across the word rather than randomly speckled.
function bucketizePoints(points, width) {
  const n = points.length / 2;
  const perBucketPoints = Array.from({ length: BUCKET_COUNT }, () => []);
  for (let i = 0; i < n; i++) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    const t = width > 0 ? Math.min(0.999, x / width) : 0;
    const bucketIdx = Math.floor(t * BUCKET_COUNT);
    perBucketPoints[bucketIdx].push(x, y);
  }
  return perBucketPoints.map((arr) => new Float32Array(arr));
}

let fontPx = 120;
let seeded = false;

function layoutWord(text, resetPositions) {
  const totalParticles = buckets.reduce((s, b) => s + b.maxParticles, 0);
  word.text = text;
  const { points, width, height } = sampleTextPoints(
    text,
    fontPx,
    totalParticles,
  );
  const w = app.clientWidth || 900;
  const h = app.clientHeight || 500;
  const offsetX = (w - width) / 2;
  const offsetY = (h - height) / 2;

  const perBucketLocal = bucketizePoints(points, width);
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const local = perBucketLocal[i];
    const scenePoints = new Float32Array(local.length);
    for (let j = 0; j < local.length; j += 2) {
      scenePoints[j] = local[j] + offsetX;
      scenePoints[j + 1] = local[j + 1] + offsetY;
    }
    buckets[i].setOrigins(scenePoints, resetPositions);
  }
  word.x = offsetX;
  word.y = offsetY;
  word.width = width;
  word.height = height;
}

function fit() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w === 0 || h === 0) return;
  scene.resize(w, h);
  if (!seeded) {
    // ComputeParticleEntity's backing Float32Array starts fully zeroed, so
    // every particle's `life` field (offset 7) is 0 — the CPU/GPU render
    // paths both skip life===0 as "dead", so calling setOrigins() alone
    // (which only ever touches position/velocity/origin) leaves every
    // particle invisible forever. initRandomParticles() is what actually
    // sets life=-1 (perpetual) and size for the whole buffer; call it once
    // up front so every later setOrigins() call only needs to move
    // particles that are already alive.
    for (const b of buckets) b.initRandomParticles(w, h);
    seeded = true;
  }
  fontPx = Math.max(56, Math.min(130, w * 0.14));
  layoutWord(panel.origin.value.toUpperCase() || "VECTOJS", true);
}

function init() {
  word = new Word();
  scene.add(word);
  frameProbe = new FrameProbe();
  scene.add(frameProbe);
  rebuildBuckets(Number(panel.count.value));
  const observer = new ResizeObserver(fit);
  observer.observe(app);
  scene.start();
}
init();

// Transform: scatter the current (origin) shape outward from the panel's
// button position, then after the burst has had time to read, reform into
// the target shape. Positions are NOT reset on the reform
// (requestPositionReset=false) — particles fly from wherever the explosion
// left them into the new word's shape.
let transforming = false;
function runTransform() {
  if (transforming) return;
  const originText = panel.origin.value.toUpperCase() || "VECTOJS";
  const targetText = panel.target.value.toUpperCase() || "CANVAS";
  transforming = true;
  panel.transform.disabled = true;

  const w = app.clientWidth || 900;
  const h = app.clientHeight || 500;
  layoutWord(originText, true);
  // Give the origin shape one frame to settle into place before scattering
  // from the canvas center, then reform into the target shape.
  window.setTimeout(() => {
    const cx = w / 2;
    const cy = h / 2;
    for (const b of buckets) b.triggerExplosion(cx, cy, 46000);
    window.setTimeout(() => {
      layoutWord(targetText, false);
      const durationMs = Number(panel.duration.value) * 100;
      window.setTimeout(() => {
        transforming = false;
        panel.transform.disabled = false;
      }, durationMs + 400);
    }, 260);
  }, 50);
}
panel.transform.addEventListener("click", runTransform);

// Particle-count slider: rebuilds the bucket entities (maxParticles is
// fixed at ComputeParticleEntity construction, not runtime-adjustable) and
// re-seeds + re-lays-out the ORIGIN word immediately so the preview stays
// live while dragging.
panel.count.addEventListener("input", () => {
  panel.countValue.textContent = panel.count.value;
});
panel.count.addEventListener("change", () => {
  rebuildBuckets(Number(panel.count.value));
  fit();
});

panel.duration.addEventListener("input", () => {
  panel.durationValue.textContent = `${(Number(panel.duration.value) / 10).toFixed(1)}s`;
});
panel.duration.addEventListener("change", () => {
  const springK = currentSpringK();
  for (const b of buckets) b.springK = springK;
});

// Color pickers: recolor buckets immediately (baseColor is a plain mutable
// property, no rebuild needed).
function recolorBuckets() {
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const t = BUCKET_COUNT === 1 ? 0 : i / (BUCKET_COUNT - 1);
    buckets[i].baseColor = lerpColor(panel.colorA.value, panel.colorB.value, t);
  }
}
panel.colorA.addEventListener("input", recolorBuckets);
panel.colorB.addEventListener("input", recolorBuckets);

// navigator.gpu being present only means the API exists, not that a real
// adapter was found — Scene tries WebGPU lazily/async on the first
// ComputeParticleEntity frame and can still fall back to CPU (e.g.
// headless/software-GL Chrome reports navigator.gpu but "No GPUAdapter
// found"). There's no exposed flag for which path is actually active, so
// the HUD reports what's requested, not a guess at what was granted.
const gpuRequested = !!navigator.gpu;

function updateHud() {
  const avg = frameProbe ? frameProbe.avgFrameTime() : 0;
  if (avg > 0) {
    const fps = 1000 / avg;
    const total = buckets.reduce((s, b) => s + b.maxParticles, 0);
    hud.textContent =
      `${total} particles (${BUCKET_COUNT} gradient buckets) · webgpu ${gpuRequested ? "requested" : "unavailable"}\n` +
      `frame ${avg.toFixed(1)}ms · ${fps.toFixed(0)} fps\n` +
      `edit From/To, then Transform`;
  }
  setTimeout(updateHud, 250);
}
updateHud();
