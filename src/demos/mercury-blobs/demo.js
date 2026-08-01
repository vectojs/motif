import { Scene, Entity } from '@vectojs/core';

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
    // interaction, making the HUD under-report for far longer than the
    // actual slowdown lasted.
    if (this.frameTimes.length > 20) this.frameTimes.shift();
  }
  avgFrameTime() {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
  }
}

const app = document.getElementById('app');
const canvas = document.getElementById('canvas');
const hud = document.getElementById('hud');

const SILVER = '#b9c2c9';
const SILVER_DARK = '#7d868c';
// Fraction of a CSS pixel per buffer pixel — deliberately LOW-res, not
// scaled to devicePixelRatio. Measured directly with per-pass
// performance.now() timers around GooLayer.render(): ctx.filter =
// 'blur(14px)' costs ~0ms at the fill() call site itself, but the browser
// evidently defers the actual blur computation until something reads the
// buffer's pixels back out — the LATER drawImage(buffer, ...) call (in a
// completely separate destination canvas, filter-free) was where ~30ms/
// frame actually landed at BUF_SCALE 1, on both headless swiftshader and
// (via the sandboxed-iframe vs standalone-page comparison that ruled out
// the iframe sandbox as a cause) real browser rendering. Since blur cost
// scales with pixel count and a blur is inherently forgiving of source
// resolution — the softness itself hides the lower detail — rendering the
// fill+blur pass at BUF_SCALE 0.5 (a quarter the pixels of 1.0) cut that
// same cost to ~6.5ms and restored a steady 60fps, confirmed clean at
// BUF_SCALE 0.5 with a side-by-side screenshot (no visible blockiness; the
// blur radius, defined in this buffer's own coordinate space, ends up
// relatively LARGER at low-res, if anything reading slightly softer).
const BUF_SCALE = 0.5;

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
    this._a11yRoundPatched = false;
  }

  isPointInside(gx, gy) {
    const p = this.worldToLocal(gx, gy);
    if (!p) return false;
    const dx = p.x - this.radius;
    const dy = p.y - this.radius;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  // Blobs drift perpetually — without this override, Scene's own idle
  // detection (default hasPendingAnimations() returns false) never sees
  // motion in flight, so the renderMode:'always' auto-throttle drops the
  // whole demo to ~2fps despite blobs visibly moving. Same root cause as
  // Constellation Lines' Point class (found in the same investigation).
  hasPendingAnimations() {
    return true;
  }

  update(dt) {
    // The a11y shadow element Scene projects for hit-testing/hover is a
    // RECTANGLE sized from width/height (entity.x,y to entity.x+width,
    // y+height) — the full bounding square of this circle, not the circle
    // itself. isPointInside()'s circle math only gates VectoJS's own
    // internal hit-test path; it does nothing for the real DOM element a
    // browser's native pointer events actually hit-test against. Without
    // this fix, the ~21.5% of the square OUTSIDE the inscribed circle (the
    // four corners) was clickable/hoverable even though nothing is drawn
    // there. CSS border-radius on the shadow element itself changes what
    // area the BROWSER considers "on" the element — a one-time patch right
    // after Scene creates it (idempotent via the dataset flag) rather than
    // every frame, since the box never changes shape after construction.
    if (!this._a11yRoundPatched && this.scene) {
      const el = this.scene.getA11yElement(this.id);
      if (el) {
        el.style.borderRadius = '50%';
        this._a11yRoundPatched = true;
      }
    }
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
    super('GooLayer');
    this.blobs = blobs;
    this.buffer = document.createElement('canvas');
    this.ctx = this.buffer.getContext('2d');
    // Contrast pass output: a SEPARATE canvas, not the same buffer drawn
    // onto itself. Measured directly: ctx.drawImage(buffer, ...) where
    // buffer is ctx's OWN canvas, with an active ctx.filter, cost ~27ms per
    // frame (nearly the entire 60fps budget) even at BUF_SCALE 1 — drawing
    // a canvas onto itself with a filter active appears to block whatever
    // fast compositing path the browser would otherwise take, forcing a
    // full software re-rasterization. Drawing into a distinct destination
    // canvas instead dropped that same pass to well under 1ms.
    this.contrastBuffer = document.createElement('canvas');
    this.contrastCtx = this.contrastBuffer.getContext('2d');
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const bw = Math.max(1, Math.round(width * BUF_SCALE));
    const bh = Math.max(1, Math.round(height * BUF_SCALE));
    this.buffer.width = bw;
    this.buffer.height = bh;
    this.contrastBuffer.width = bw;
    this.contrastBuffer.height = bh;
  }

  isPointInside() {
    return false;
  }

  render(r) {
    const { ctx, buffer, contrastCtx, contrastBuffer } = this;
    if (buffer.width <= 1) return;
    const s = BUF_SCALE;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Pass 1: solid fills, heavily blurred — this is what makes nearby
    // blobs' blurred halos overlap and merge.
    ctx.filter = 'blur(14px)';
    ctx.fillStyle = SILVER;
    for (const b of this.blobs) {
      ctx.beginPath();
      ctx.arc(b.x + b.radius, b.y + b.radius, b.radius * 0.82, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.filter = 'none';

    // Pass 2: a steep contrast ramp snaps the blur back to a near-hard
    // edge — this is the actual "goo" step. Values above ~30% opacity in
    // the blurred buffer become fully opaque; below, fully transparent.
    // Copies FROM buffer INTO contrastBuffer, a distinct canvas — measured
    // directly with per-pass timers while diagnosing a real jank report:
    // ctx.filter='blur(14px)' during the Pass 1 fills costs ~0ms at the
    // fill() call site, but the actual blur computation is evidently
    // DEFERRED until something reads the buffer's pixels back out — this
    // drawImage(buffer, ...) call was where the cost actually landed
    // (~30ms/frame at BUF_SCALE 1, independent of any ctx.filter on THIS
    // call, and independent of drawing to a separate vs the same canvas —
    // both ruled out by isolated measurement). BUF_SCALE 0.5 above is what
    // actually fixes this: a quarter the pixels for the blur to flatten
    // cuts this same pass to ~6.5ms and restores 60fps.
    contrastCtx.setTransform(1, 0, 0, 1, 0, 0);
    contrastCtx.clearRect(0, 0, contrastBuffer.width, contrastBuffer.height);
    contrastCtx.filter = 'contrast(28) brightness(0.94)';
    contrastCtx.drawImage(buffer, 0, 0);
    contrastCtx.filter = 'none';

    // Metallic shading: a radial highlight per blob, masked to the merged
    // silhouette so it reads as one liquid surface catching light, not N
    // separate spheres. Drawn onto contrastBuffer (the now-authoritative
    // silhouette) via the same "source-atop" masking trick as the original.
    contrastCtx.setTransform(s, 0, 0, s, 0, 0);
    contrastCtx.globalCompositeOperation = 'source-atop';
    for (const b of this.blobs) {
      const cx = b.x + b.radius;
      const cy = b.y + b.radius;
      const g = contrastCtx.createRadialGradient(
        cx - b.radius * 0.3,
        cy - b.radius * 0.35,
        0,
        cx,
        cy,
        b.radius * 1.1,
      );
      g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      g.addColorStop(0.35, 'rgba(255, 255, 255, 0.15)');
      g.addColorStop(0.7, `${SILVER_DARK}00`);
      g.addColorStop(1, `${SILVER_DARK}55`);
      contrastCtx.fillStyle = g;
      contrastCtx.beginPath();
      contrastCtx.arc(b.x + b.radius, b.y + b.radius, b.radius * 1.1, 0, Math.PI * 2);
      contrastCtx.fill();
    }
    contrastCtx.globalCompositeOperation = 'source-over';

    r.drawImage(contrastBuffer, 0, 0, this.width, this.height);
  }
}

const scene = new Scene(canvas, {
  // 'always' is Scene's default renderMode; blobs drift continuously.
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

const frameProbe = new FrameProbe();
scene.add(frameProbe);

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
  b.on('pointerdown', (e) => {
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

window.addEventListener('pointermove', (e) => {
  if (!grabbed) return;
  const rect = canvas.getBoundingClientRect();
  grabbed.x = e.clientX - rect.left - grabDX;
  grabbed.y = e.clientY - rect.top - grabDY;
});
window.addEventListener('pointerup', () => {
  if (grabbed) grabbed.dragging = false;
  grabbed = null;
});

// --- Blob-count buttons ---
const countButtons = { 'btn-count-3': 3, 'btn-count-6': 6, 'btn-count-12': 12 };
for (const [id, count] of Object.entries(countButtons)) {
  document.getElementById(id).addEventListener('click', () => {
    for (const other of Object.keys(countButtons))
      document.getElementById(other).setAttribute('aria-pressed', String(other === id));
    spawnBlobs(count); // wires drag on the new blobs itself
  });
}

function updateHud() {
  const avg = frameProbe.avgFrameTime();
  if (avg > 0) {
    const fps = 1000 / avg;
    hud.textContent =
      `${blobs.length} blobs · goo blur+contrast pass\n` +
      `frame ${avg.toFixed(1)}ms · ${fps.toFixed(0)} fps\n` +
      `drag any blob`;
  }
  setTimeout(updateHud, 250);
}
updateHud();
