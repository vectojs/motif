import { Scene, Entity } from '@vectojs/core';

class GradientBg extends Entity {
  isPointInside() {
    return false;
  }
  render(r) {
    const ctx = r.getContext();
    const W = this.scene.width;
    const H = this.scene.height;
    ctx.fillStyle = '#f7f4ee';
    ctx.fillRect(0, 0, W, H);
    const blobs = [
      { x: W * 0.18, y: H * 0.25, r: Math.min(W, H) * 0.4, c: '#d97757' },
      { x: W * 0.75, y: H * 0.65, r: Math.min(W, H) * 0.35, c: '#38bdf8' },
      { x: W * 0.5, y: H * 0.15, r: Math.min(W, H) * 0.25, c: '#f2b880' },
      { x: W * 0.85, y: H * 0.2, r: Math.min(W, H) * 0.2, c: '#a78bfa' },
    ];
    for (const b of blobs) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, hexRgba(b.c, 0.25));
      g.addColorStop(1, hexRgba(b.c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

// Keyed by "wxh" rather than a single last-used slot: the three panels have
// different sizes, so a single-slot cache thrashed every render call (each
// panel's draw evicted the previous panel's grain), regenerating a brand
// new random noise texture on every single frame for whichever panel didn't
// match the slot — which read as the grain visibly crawling/flickering
// instead of being a static per-panel texture.
const grainCacheBySize = new Map();

function getGrain(w, h) {
  const key = `${w}x${h}`;
  const cached = grainCacheBySize.get(key);
  if (cached) return cached;
  const grain = document.createElement('canvas');
  grain.width = w;
  grain.height = h;
  const ctx = grain.getContext('2d');
  const id = ctx.createImageData(w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 60;
  }
  ctx.putImageData(id, 0, 0);
  grainCacheBySize.set(key, grain);
  return grain;
}

function hexRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

class FrostedPanel extends Entity {
  blurRadius = 10;
  grainIntensity = 0.06;
  tintOpacity = 0.25;
  cr = 14;

  constructor(x, y, w, h, tiltDeg) {
    super('FrostedPanel');
    // Use Entity's own x/y/rotation rather than custom fields: Scene's
    // renderNode() already does translate(node.x, node.y) + rotate(node.rotation)
    // for every entity before calling render(). A prior version of this demo
    // stored position in fields named `_x`/`_y` and translated/rotated a
    // SECOND time inside render() — but `_x`/`_y` are the exact private
    // backing-field names Entity.x/Entity.y already use internally, so that
    // write silently aliased the same slot Entity reads for its own
    // transform. The net effect doubled every panel's on-screen position
    // every frame while isPointInside() (and the drag handlers) kept
    // computing hit-testing against the single, un-doubled value — so the
    // draggable area never matched what was drawn, and the smallest/most
    // tilted panel landed far enough off to look entirely invisible.
    this.x = x;
    this.y = y;
    this.rotation = (tiltDeg * Math.PI) / 180;
    this.pw = w;
    this.ph = h;
  }

  isPointInside(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    const rad = -this.rotation;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return rx >= 0 && rx <= this.pw && ry >= 0 && ry <= this.ph;
  }

  render(r) {
    const ctx = r.getContext();
    // Scene's renderNode() has already applied translate(x,y) + rotate(rotation)
    // before calling render(), so local drawing starts at (0,0) with no tilt.
    roundedRect(ctx, 0, 0, this.pw, this.ph, this.cr);
    ctx.clip();

    if (!this._bg || this._bgW !== this.pw || this._bgH !== this.ph) {
      this._bg = document.createElement('canvas');
      this._bgW = this.pw;
      this._bgH = this.ph;
      this._bg.width = this.pw;
      this._bg.height = this.ph;
    }
    const bctx = this._bg.getContext('2d');
    bctx.clearRect(0, 0, this.pw, this.ph);
    // ctx.getTransform() gives the CURRENT accumulated transform (translate
    // + rotate applied by Scene, at DPR scale) — mapping this entity's local
    // (0,0) origin to its true position on the physical backing store, so
    // the source rect below is correct even while the panel is rotated.
    const t = ctx.getTransform();
    const dpr = ctx.canvas.width / this.scene.width;
    bctx.drawImage(ctx.canvas, t.e, t.f, this.pw * dpr, this.ph * dpr, 0, 0, this.pw, this.ph);
    bctx.filter = `blur(${this.blurRadius}px)`;
    bctx.drawImage(this._bg, 0, 0);
    bctx.filter = 'none';
    // IRenderer.drawImage requires the full 5-arg (source, dx, dy, dw, dh)
    // signature — unlike native CanvasRenderingContext2D.drawImage, it has
    // no 3-arg overload, so omitting dw/dh passes them through as
    // `undefined` and the native call silently draws nothing.
    r.drawImage(this._bg, 0, 0, this.pw, this.ph);

    ctx.fillStyle = `rgba(255,255,255,${this.tintOpacity})`;
    ctx.fillRect(0, 0, this.pw, this.ph);

    if (this.grainIntensity > 0) {
      const grain = getGrain(this.pw, this.ph);
      r.globalAlpha = Math.min(1, this.grainIntensity * 3);
      r.drawImage(grain, 0, 0, this.pw, this.ph);
      r.globalAlpha = 1;
    }

    r.strokeStyle = 'rgba(255,255,255,0.25)';
    r.lineWidth = 1.5;
    roundedRect(ctx, 0.5, 0.5, this.pw - 1, this.ph - 1, this.cr);
    r.stroke();
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

const app = document.getElementById('app');
const canvas = document.getElementById('canvas');

const scene = new Scene(canvas, {
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});
// Nothing here animates: no entity has an update(), and the panels only move
// when dragged. Every mutation marks the scene dirty, and scene.resize() marks
// it internally, so 'always' would just redraw an unchanged frame forever.
//
// renderMode is a FIELD, not a SceneOptions key. Passing it to the constructor
// is silently ignored — measured in Chrome 150, that left this scene painting a
// steady 2.00Hz (core's idle auto-throttle for 'always') instead of 0.
scene.renderMode = 'onDemand';

scene.add(new GradientBg());

const panels = [];
function createPanels(w, h) {
  for (const p of panels) scene.remove(p);
  panels.length = 0;
  const pw = Math.min(220, w * 0.28);
  const ph = Math.min(300, h * 0.55);
  panels.push(new FrostedPanel(w * 0.12, h * 0.2, pw, ph, -3));
  panels.push(new FrostedPanel(w * 0.62, h * 0.35, pw * 0.9, ph * 0.8, 2));
  panels.push(new FrostedPanel(w * 0.35, h * 0.18, pw * 0.75, ph * 0.65, 5));
  for (const p of panels) scene.add(p);
}

let dragging = null;
let dragOffX = 0;
let dragOffY = 0;

canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i];
    if (p.isPointInside(mx, my)) {
      dragging = p;
      dragOffX = mx - p.x;
      dragOffY = my - p.y;
      scene.remove(p);
      scene.add(p);
      panels.splice(i, 1);
      panels.push(p);
      // Raising the grabbed panel changes what is drawn on top, so the scene
      // has to repaint even though nothing moved yet.
      scene.markDirty();
      break;
    }
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const r = canvas.getBoundingClientRect();
  dragging.x = e.clientX - r.left - dragOffX;
  dragging.y = e.clientY - r.top - dragOffY;
  scene.markDirty();
});
canvas.addEventListener('pointerup', () => {
  dragging = null;
});
canvas.addEventListener('pointerleave', () => {
  dragging = null;
});

const blurInput = document.getElementById('input-blur');
const grainInput = document.getElementById('input-grain');
const tintInput = document.getElementById('input-tint');

function updateAllPanels() {
  for (const p of panels) {
    p.blurRadius = Number(blurInput.value);
    p.grainIntensity = Number(grainInput.value) / 100;
    p.tintOpacity = Number(tintInput.value) / 100;
  }
  scene.markDirty();
}

blurInput.addEventListener('input', () => {
  document.getElementById('value-blur').textContent = `${blurInput.value}px`;
  updateAllPanels();
});
grainInput.addEventListener('input', () => {
  document.getElementById('value-grain').textContent = (Number(grainInput.value) / 100).toFixed(2);
  updateAllPanels();
});
tintInput.addEventListener('input', () => {
  document.getElementById('value-tint').textContent = (Number(tintInput.value) / 100).toFixed(2);
  updateAllPanels();
});

const observer = new ResizeObserver(() => {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w > 0 && h > 0) {
    scene.resize(w, h);
    createPanels(w, h);
  }
});
observer.observe(app);

scene.start();

document.getElementById('hud').textContent =
  'drag panels to rearrange · blur/grain/tint adjustable';
