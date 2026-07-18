import { Scene, Entity, ComputeParticleEntity } from "@vectojs/core";

// Measures the Scene's REAL render cadence, not the display's vsync rate.
// An independent requestAnimationFrame loop (the original approach here)
// fires every vsync tick regardless of whether Scene actually rendered that
// tick — on a 240Hz display it samples ~240 ticks/sec even while
// Scene.loop()'s own maxFPS cap renders only every 4th one, so the HUD read
// "240fps" while the visible motion was genuinely capped at 60. Entity.
// update(dt) is only ever called from inside Scene's renderNode() walk,
// which is skipped entirely on a throttled/skipped tick — so a probe
// entity's own update() calls are a direct measurement of frames Scene
// actually rendered.
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
    // fps transition — a 60-sample window (the original choice) held onto
    // ~60 stale throttled-2fps samples for roughly a full second after
    // Scene un-throttled following a click, making the HUD read "3fps"
    // for ~800ms after motion had already resumed at 60fps.
    if (this.frameTimes.length > 20) this.frameTimes.shift();
  }
  avgFrameTime() {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
  }
}

// Particle text: a word is rendered once into an offscreen canvas, sampled
// into a point cloud, and fed to ComputeParticleEntity as each particle's
// "origin" — the spring-to-origin physics built into the entity is what
// holds the shape together. Click anywhere to scatter the current word
// (triggerExplosion) and reform into the next one (setOrigins to a new
// point cloud, positions left where they scattered so they fly INTO place).
//
// The point of this demo: content projection must stay correct through all
// of it. getContentProjection() on the (invisible, non-particle) Word entity
// always reports the real word string — Ctrl+F, translation, and screen
// readers see real text throughout the explosion/reform cycle, never the
// literal particle positions.

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");
const hud = document.getElementById("hud");

const CORAL = "#d97757";
const WORDS = ["VECTOJS", "CANVAS", "MOTIF", "GPU"];
const MAX_PARTICLES = 1400;
const SAMPLE_CANVAS_H = 220;

// Rasterize `text` and return up to `maxPoints` (x, y) samples of its
// opaque pixels, in the rasterizing canvas's own pixel space, along with the
// tight bounding box of those samples (so the caller can re-center them).
function sampleTextPoints(text, fontPx, maxPoints) {
  const probe = document.createElement("canvas");
  const pctx = probe.getContext("2d");
  const font = `900 ${fontPx}px "Inter", system-ui, sans-serif`;
  pctx.font = font;
  const width = Math.ceil(pctx.measureText(text).width) + 40;
  probe.width = width;
  probe.height = SAMPLE_CANVAS_H;
  pctx.font = font;
  pctx.fillStyle = "#000";
  pctx.textBaseline = "middle";
  pctx.fillText(text, 20, SAMPLE_CANVAS_H / 2);

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

  const nCandidates = candidates.length / 2;
  const points = new Float32Array(Math.min(maxPoints, nCandidates) * 2);
  const keep = Math.min(maxPoints, nCandidates);
  const stride = nCandidates / keep;
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
      selectable: true,
    };
  }
}

const scene = new Scene(canvas, {
  renderMode: "always", // particles are perpetually integrating
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

const particles = new ComputeParticleEntity({
  maxParticles: MAX_PARTICLES,
  size: 2.6,
  color: CORAL,
  springK: 0.12,
  damping: 0.9,
  bounceDamping: 0.4,
  maxVelocity: 900,
});
scene.add(particles);

const word = new Word();
scene.add(word);

const frameProbe = new FrameProbe();
scene.add(frameProbe);

let wordIndex = 0;
let fontPx = 120;

function layoutWord(text, resetPositions) {
  word.text = text;
  const { points, width, height } = sampleTextPoints(
    text,
    fontPx,
    MAX_PARTICLES,
  );
  const w = app.clientWidth || 900;
  const h = app.clientHeight || 500;
  const offsetX = (w - width) / 2;
  const offsetY = (h - height) / 2;
  const scenePoints = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 2) {
    scenePoints[i] = points[i] + offsetX;
    scenePoints[i + 1] = points[i + 1] + offsetY;
  }
  particles.setOrigins(scenePoints, resetPositions);
  word.x = offsetX;
  word.y = offsetY;
  word.width = width;
  word.height = height;
}

let seeded = false;

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
    particles.initRandomParticles(w, h);
    seeded = true;
  }
  fontPx = Math.max(56, Math.min(130, w * 0.14));
  layoutWord(WORDS[wordIndex], true);
}
const observer = new ResizeObserver(fit);
observer.observe(app);

// Click anywhere: scatter the current word from the click point, then after
// the burst has had time to read, reform into the next word. Positions are
// NOT reset on the reform (requestPositionReset=false) — particles fly from
// wherever the explosion left them into the new word's shape, which is the
// "reassembles into new text" effect.
canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  particles.triggerExplosion(x, y, 46000);
  wordIndex = (wordIndex + 1) % WORDS.length;
  window.setTimeout(() => layoutWord(WORDS[wordIndex], false), 260);
});

scene.start();

// navigator.gpu being present only means the API exists, not that a real
// adapter was found — Scene tries WebGPU lazily/async on the first
// ComputeParticleEntity frame and can still fall back to CPU (e.g.
// headless/software-GL Chrome reports navigator.gpu but "No GPUAdapter
// found"). There's no exposed flag for which path is actually active, so
// the HUD reports what's requested, not a guess at what was granted.
const gpuRequested = !!navigator.gpu;

function updateHud() {
  const avg = frameProbe.avgFrameTime();
  if (avg > 0) {
    const fps = 1000 / avg;
    hud.textContent =
      `${MAX_PARTICLES} particles · webgpu ${gpuRequested ? "requested" : "unavailable"}\n` +
      `frame ${avg.toFixed(1)}ms · ${fps.toFixed(0)} fps\n` +
      `click to scatter → reforms as next word`;
  }
  setTimeout(updateHud, 250);
}
updateHud();
