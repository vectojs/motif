import { Scene, Entity } from "@vectojs/core";

// Mercury blobs: draggable circles that visually MERGE into one shape when
// close and split apart when pulled away — the classic "goo" trick, not a
// per-pixel metaball/marching-squares implementation. Each blob draws a
// solid circle into a shared offscreen buffer, blurred; a contrast filter
// then snaps the blurred overlap back to a hard edge, so overlapping blurs
// read as one continuous liquid surface instead of two soft shadows. This
// keeps the per-frame cost O(blob count) for the fills plus a FIXED cost for
// the blur+contrast pass (bounded by buffer resolution, not blob count) —
// the honest reason this technique scales to a dozen blobs at 60fps while a
// true per-pixel SDF metaball evaluation would cost O(pixels x blobs).

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");
const hud = document.getElementById("hud");

const SILVER = "#b9c2c9";
const SILVER_DARK = "#7d868c";
const BUF_SCALE = Math.min(window.devicePixelRatio || 1, 2);

class Blob extends Entity {
  constructor(radius) {
    super();
    this.radius = radius;
    // width/height define the a11y shadow element's DOM box (Scene.syncA11y
    // sizes it from these, not from isPointInside/render) — leaving them at
    // the Entity default of 0 meant the projected click target was a 0x0
    // element, so pointerdown never reached this entity no matter how
    // correct isPointInside's circle math was.
    this.width = radius * 2;
    this.height = radius * 2;
    this.vx = (Math.random() - 0.5) * 24;
    this.vy = (Math.random() - 0.5) * 24;
    this.interactive = true;
  }

  isPointInside(gx, gy) {
    const p = this.worldToLocal(gx, gy);
    if (!p) return false;
    const dx = p.x - this.radius;
    const dy = p.y - this.radius;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  update(dt) {
    if (this.dragging) return;
    const step = Math.min(dt, 32) / 1000;
    const w = this.scene?.width ?? 0;
    const h = this.scene?.height ?? 0;
    let nx = this.x + this.vx * step;
    let ny = this.y + this.vy * step;
    const r = this.radius;
    if (nx < r) {
      nx = r;
      this.vx = Math.abs(this.vx);
    } else if (nx > w - r) {
      nx = w - r;
      this.vx = -Math.abs(this.vx);
    }
    if (ny < r) {
      ny = r;
      this.vy = Math.abs(this.vy);
    } else if (ny > h - r) {
      ny = h - r;
      this.vy = -Math.abs(this.vy);
    }
    this.x = nx;
    this.y = ny;
  }

  render() {
    // Never called: GooLayer draws every blob's pixels in one composited
    // pass so the blur/contrast filters apply across blob boundaries.
  }
}

// Owns the shared offscreen composition buffer. Runs AFTER the blobs in the
// tree (added last) is wrong for z-order here — instead this is added FIRST
// and reads live blob.x/y/radius each frame, so blob drag updates (handled
// by pointer listeners below, not by this entity) are reflected immediately.
class GooLayer extends Entity {
  constructor(blobs) {
    super("GooLayer");
    this.blobs = blobs;
    this.buffer = document.createElement("canvas");
    this.ctx = this.buffer.getContext("2d");
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.buffer.width = Math.max(1, Math.round(width * BUF_SCALE));
    this.buffer.height = Math.max(1, Math.round(height * BUF_SCALE));
  }

  isPointInside() {
    return false;
  }

  render(r) {
    const { ctx, buffer } = this;
    if (buffer.width <= 1) return;
    const s = BUF_SCALE;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Pass 1: solid fills, heavily blurred — this is what makes nearby
    // blobs' blurred halos overlap and merge.
    ctx.filter = "blur(14px)";
    ctx.fillStyle = SILVER;
    for (const b of this.blobs) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.82, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pass 2: a steep contrast ramp snaps the blur back to a near-hard
    // edge — this is the actual "goo" step. Values above ~30% opacity in
    // the blurred buffer become fully opaque; below, fully transparent.
    // Applying it via a second drawImage-of-self (rather than a CSS
    // filter string with contrast(), which browsers apply BEFORE the
    // alpha is settled) keeps the edge crisp regardless of blob overlap.
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.filter = "contrast(28) brightness(0.94)";
    ctx.drawImage(buffer, 0, 0, this.width, this.height);
    ctx.restore();

    // Metallic shading: a radial highlight per blob, masked to the merged
    // silhouette so it reads as one liquid surface catching light, not N
    // separate spheres.
    ctx.globalCompositeOperation = "source-atop";
    for (const b of this.blobs) {
      const g = ctx.createRadialGradient(
        b.x - b.radius * 0.3,
        b.y - b.radius * 0.35,
        0,
        b.x,
        b.y,
        b.radius * 1.1,
      );
      g.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      g.addColorStop(0.35, "rgba(255, 255, 255, 0.15)");
      g.addColorStop(0.7, `${SILVER_DARK}00`);
      g.addColorStop(1, `${SILVER_DARK}55`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    r.drawImage(buffer, 0, 0, this.width, this.height);
  }
}

const scene = new Scene(canvas, {
  renderMode: "always", // blobs drift continuously
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

let blobs = [];
let goo = null;

// --- Drag: window-level pointermove so a fast drag that outruns the blob
// still tracks (same pattern as Liquid Glass's card drag). Shared across
// spawnBlobs() calls (button clicks respawn an entirely new blob array) so
// there is exactly one place wiring pointerdown, not two copies that could
// drift apart.
let grabbed = null;
let grabDX = 0;
let grabDY = 0;
function wireDrag(b) {
  b.on("pointerdown", (e) => {
    grabbed = b;
    b.dragging = true;
    grabDX = e.sceneX - b.x;
    grabDY = e.sceneY - b.y;
  });
}

function spawnBlobs(count) {
  for (const b of blobs) scene.remove(b);
  if (goo) scene.remove(goo);
  grabbed = null;
  const w = app.clientWidth || 800;
  const h = app.clientHeight || 600;
  const baseR = count <= 3 ? 70 : count <= 6 ? 50 : 34;
  blobs = Array.from({ length: count }, () => {
    const b = new Blob(baseR * (0.75 + Math.random() * 0.5));
    b.x = b.radius + Math.random() * (w - b.radius * 2);
    b.y = b.radius + Math.random() * (h - b.radius * 2);
    return b;
  });
  goo = new GooLayer(blobs);
  goo.resize(w, h);
  // GooLayer first so blobs (interactive hit targets) sit "on top" for
  // pointer routing even though GooLayer draws all the visible pixels.
  scene.add(goo);
  for (const b of blobs) {
    scene.add(b);
    wireDrag(b);
  }
}

spawnBlobs(6);

// Tracks the canvas size fit() last saw, so a resize can rescale existing
// blob positions proportionally instead of leaving them exactly where they
// were. scene.resize() only changes the canvas/backing-store dimensions —
// it does not touch entity positions — so shrinking the canvas can push a
// blob outside the new bounds (Blob.update()'s edge-bounce logic then
// re-clamps it, but only to the nearest edge, not to a proportional
// position) and growing back leaves every blob still confined to whatever
// sub-region it had bounced into at the smaller size, clustering them
// instead of spreading across the newly available area.
let lastW = 0;
let lastH = 0;

function fit() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w === 0 || h === 0) return;
  scene.resize(w, h);
  goo?.resize(w, h);
  if (lastW > 0 && lastH > 0 && (lastW !== w || lastH !== h)) {
    const sx = w / lastW;
    const sy = h / lastH;
    for (const b of blobs) {
      b.x *= sx;
      b.y *= sy;
    }
  }
  lastW = w;
  lastH = h;
}
const observer = new ResizeObserver(fit);
observer.observe(app);

scene.start();

window.addEventListener("pointermove", (e) => {
  if (!grabbed) return;
  const rect = canvas.getBoundingClientRect();
  grabbed.x = e.clientX - rect.left - grabDX;
  grabbed.y = e.clientY - rect.top - grabDY;
});
window.addEventListener("pointerup", () => {
  if (grabbed) grabbed.dragging = false;
  grabbed = null;
});

// --- Blob-count buttons ---
const countButtons = { "btn-count-3": 3, "btn-count-6": 6, "btn-count-12": 12 };
for (const [id, count] of Object.entries(countButtons)) {
  document.getElementById(id).addEventListener("click", () => {
    for (const other of Object.keys(countButtons))
      document
        .getElementById(other)
        .setAttribute("aria-pressed", String(other === id));
    spawnBlobs(count); // wires drag on the new blobs itself
  });
}

// --- HUD: independent rAF sampler (Scene exposes no per-frame hook) ---
const frameTimes = [];
let lastT = performance.now();
function sampleFrame(now) {
  frameTimes.push(now - lastT);
  lastT = now;
  if (frameTimes.length > 60) frameTimes.shift();
  requestAnimationFrame(sampleFrame);
}
requestAnimationFrame((t) => {
  lastT = t;
  requestAnimationFrame(sampleFrame);
});

function updateHud() {
  if (frameTimes.length > 0) {
    const avg = frameTimes.reduce((s, v) => s + v, 0) / frameTimes.length;
    const fps = 1000 / avg;
    hud.textContent =
      `${blobs.length} blobs · goo blur+contrast pass\n` +
      `frame ${avg.toFixed(1)}ms · ${fps.toFixed(0)} fps\n` +
      `drag any blob`;
  }
  setTimeout(updateHud, 250);
}
updateHud();
