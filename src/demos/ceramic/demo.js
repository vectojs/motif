import { Scene, Entity } from '@vectojs/core';

// Ceramic keys: glazed-clay keycaps with a physical press. The material is
// baked ONCE into offscreen sprites (glaze gradients, speckle, rim shading,
// a blurred studio shadow) — per-frame work is just drawImage plus the
// engine's spring on y/scale. That split — expensive texture offline, cheap
// motion online — is the pattern for any tactile material in VectoJS.

const app = document.getElementById('app');
const canvas = document.getElementById('canvas');

const MUTED = '#8a8073';
const SPRITE_SCALE = Math.min(window.devicePixelRatio || 1, 2);

// Deterministic speckle so every load fires the same kiln.
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + amount)));
  const rr = ch((n >> 16) & 255);
  const gg = ch((n >> 8) & 255);
  const bb = ch(n & 255);
  return `rgb(${rr}, ${gg}, ${bb})`;
}

// Bake one glazed keycap body at 2x. Layers, bottom to top: base gradient,
// radial glaze bloom, rim shading, speckle, crisp highlight arc.
function bakeCeramic(width, height, radius, glaze, seed) {
  const s = SPRITE_SCALE;
  const c = document.createElement('canvas');
  c.width = width * s;
  c.height = height * s;
  const ctx = c.getContext('2d');
  ctx.scale(s, s);

  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, radius);
  ctx.clip();

  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, shade(glaze, 34));
  base.addColorStop(0.55, glaze);
  base.addColorStop(1, shade(glaze, -26));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Glaze bloom: the wet-looking pool of light where the glaze ran thick.
  const bloom = ctx.createRadialGradient(
    width * 0.32,
    height * 0.26,
    4,
    width * 0.32,
    height * 0.26,
    width * 0.7,
  );
  bloom.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
  bloom.addColorStop(0.45, 'rgba(255, 255, 255, 0.12)');
  bloom.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);

  // Fired-clay speckle: tiny dark flecks with a few pale ones.
  const rand = makeRandom(seed);
  for (let i = 0; i < 260; i++) {
    const dark = rand() > 0.22;
    ctx.fillStyle = dark
      ? `rgba(58, 44, 32, ${0.04 + rand() * 0.09})`
      : `rgba(255, 255, 255, ${0.08 + rand() * 0.1})`;
    const d = 0.6 + rand() * 1.7;
    ctx.beginPath();
    ctx.arc(rand() * width, rand() * height, d, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rim: darker toward the bottom edge (clay thickness), bright top lip.
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(58, 44, 32, 0.24)';
  ctx.beginPath();
  ctx.roundRect(0.5, 2, width - 1, height - 2.5, radius);
  ctx.stroke();

  // Top lip highlight: an OPEN arc tracing just the top-rounded edge, not a
  // closed rect — roundRect()+stroke() on a half-height box draws its full
  // perimeter, including a hard straight line across the middle of the key
  // where the box's bottom edge falls. Trace only the rounded corners + the
  // straight span between them instead.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  const r = radius - 1;
  ctx.beginPath();
  ctx.moveTo(1.5, height * 0.42);
  ctx.lineTo(1.5, r + 1.25);
  ctx.arcTo(1.5, 1.25, 1.5 + r, 1.25, r);
  ctx.lineTo(width - 1.5 - r, 1.25);
  ctx.arcTo(width - 1.5, 1.25, width - 1.5, r + 1.25, r);
  ctx.lineTo(width - 1.5, height * 0.42);
  ctx.stroke();

  return c;
}

// Soft studio shadow, baked via filter blur. Drawn UNDER the key; the press
// counter-offsets it so the shadow stays put while the cap sinks toward it.
function bakeShadow(width, height, radius) {
  const s = SPRITE_SCALE;
  const pad = 26;
  const c = document.createElement('canvas');
  c.width = (width + pad * 2) * s;
  c.height = (height + pad * 2) * s;
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  ctx.filter = 'blur(11px)';
  ctx.fillStyle = 'rgba(70, 55, 40, 0.38)';
  ctx.beginPath();
  ctx.roundRect(pad, pad + 4, width, height - 2, radius);
  ctx.fill();
  return { canvas: c, pad };
}

const PRESS_DEPTH = 5;

class CeramicKey extends Entity {
  constructor(label, glaze, width, height, seed, onPress) {
    super(`CeramicKey:${label}`);
    this.width = width;
    this.height = height;
    this.label = label;
    this.interactive = true;
    this.body = bakeCeramic(width, height, 16, glaze, seed);
    this.shadow = bakeShadow(width, height, 16);
    this.baseY = 0;
    // A stiff, slightly underdamped spring: the cap thunks down fast and
    // pops back with one small overshoot — clay, not rubber.
    this.setTransition({ y: { stiffness: 620, damping: 21 } });

    this.on('pointerdown', () => {
      this.y = this.baseY + PRESS_DEPTH;
      onPress(label);
    });
    this.on('pointerup', () => {
      this.y = this.baseY;
    });
    this.on('pointerleave', () => {
      this.y = this.baseY;
    });
  }

  place(x, y) {
    this.setPosition(x, y);
    this.baseY = y;
  }

  isPointInside(gx, gy) {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  render(r) {
    // depth 0 (rested) → 1 (fully pressed), read from the live spring value.
    const depth = Math.max(0, Math.min(1, (this.y - this.baseY) / PRESS_DEPTH));
    const { canvas: sh, pad } = this.shadow;
    // Cancel the entity's own y-motion so the shadow stays on the "desk",
    // and tighten it as the cap approaches the surface.
    r.save();
    r.setGlobalAlpha(1 - depth * 0.45);
    r.drawImage(
      sh,
      -pad + depth * 2,
      -pad + (this.baseY - this.y) + depth * 3,
      sh.width / SPRITE_SCALE - depth * 4,
      sh.height / SPRITE_SCALE - depth * 4,
    );
    r.restore();
    r.drawImage(this.body, 0, 0, this.width, this.height);
    r.fillText(
      this.label,
      this.width / 2 - 8,
      this.height / 2 + 9,
      '700 24px "Inter", sans-serif',
      'rgba(42, 39, 35, 0.78)',
    );
  }
}

class CeramicToggle extends Entity {
  constructor(width, height) {
    super('CeramicToggle');
    this.width = width;
    this.height = height;
    this.interactive = true;
    this.checked = false;
    this.knobSize = height - 10;
    // Recessed track: an inverted glaze (dark top lip = carved into clay).
    // Two variants ("off" raw clay, "on" warm coral wash) crossfade with the
    // knob so the whole toggle — not just the small knob — reads as changed.
    const s = SPRITE_SCALE;
    this.trackOff = bakeTrack(width, height, s, ['#cfc4b2', '#e6ddcc', '#f2ecdf']);
    this.trackOn = bakeTrack(width, height, s, ['#e2a184', '#eec19f', '#f6dcc3']);

    function bakeTrack(w, h, scale, stops) {
      const c = document.createElement('canvas');
      c.width = w * scale;
      c.height = h * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, h / 2);
      ctx.clip();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, stops[0]);
      g.addColorStop(0.5, stops[1]);
      g.addColorStop(1, stops[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(58, 44, 32, 0.3)';
      ctx.beginPath();
      ctx.roundRect(1, 1.75, w - 2, h, h / 2);
      ctx.stroke();
      return c;
    }

    this.knobOff = bakeCeramic(this.knobSize, this.knobSize, this.knobSize / 2, '#e9dfcd', 7);
    this.knobOn = bakeCeramic(this.knobSize, this.knobSize, this.knobSize / 2, '#d97757', 8);
    // t: knob travel AND glaze crossfade, integrated in update() — an
    // example of custom motion (hasPendingAnimations) beside engine springs.
    this.t = 0;
    this.tTarget = 0;
    this.vel = 0;

    this.on('click', () => {
      this.checked = !this.checked;
      this.tTarget = this.checked ? 1 : 0;
      this.scene?.markDirty();
    });
  }

  isPointInside(gx, gy) {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  // Scene contract: while this returns true the idle throttle stays off, so
  // the hand-rolled spring below animates at full rate even in onDemand mode.
  hasPendingAnimations() {
    return (
      Math.abs(this.t - this.tTarget) > 0.001 ||
      Math.abs(this.vel) > 0.001 ||
      super.hasPendingAnimations()
    );
  }

  update(dt, time) {
    super.update(dt, time);
    const step = Math.min(dt, 32) / 1000;
    const k = 210;
    const d = 19;
    this.vel += (this.tTarget - this.t) * k * step - this.vel * d * step;
    this.t += this.vel * step;
  }

  render(r) {
    const t = Math.max(0, Math.min(1, this.t));
    const x = 5 + t * (this.width - this.knobSize - 10);
    r.save();
    r.setGlobalAlpha(1);
    r.drawImage(this.trackOff, 0, 0, this.width, this.height);
    r.setGlobalAlpha(t);
    r.drawImage(this.trackOn, 0, 0, this.width, this.height);
    r.setGlobalAlpha(1);
    r.drawImage(this.knobOff, x, 5, this.knobSize, this.knobSize);
    r.setGlobalAlpha(t);
    r.drawImage(this.knobOn, x, 5, this.knobSize, this.knobSize);
    r.restore();
    r.fillText(
      this.checked ? 'glaze: coral' : 'glaze: raw',
      this.width + 16,
      this.height / 2 + 5,
      '400 14px "Inter", sans-serif',
      MUTED,
    );
  }
}

// Material demos are static between interactions, so paint only on demand.
const scene = new Scene(canvas, {
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
  renderMode: 'onDemand',
});

let pressed = '—';
class Board extends Entity {
  isPointInside() {
    return false;
  }
  render(r) {
    r.fillText(
      `Fired at 1260 °C · last press: ${pressed}`,
      0,
      0,
      '400 14px "Inter", sans-serif',
      MUTED,
    );
  }
}

const board = new Board('Board');
scene.add(board);

const KEY_W = 112;
const KEY_H = 96;
const keys = [
  new CeramicKey('⌘', '#d97757', KEY_W, KEY_H, 11, onPress),
  new CeramicKey('⇧', '#7fb6a4', KEY_W, KEY_H, 12, onPress),
  new CeramicKey('⏎', '#e9d8a6', KEY_W, KEY_H, 13, onPress),
];
function onPress(label) {
  pressed = label;
}
// One at a time: Scene.add takes a single entity (unlike the variadic
// Entity.add) — in plain JS a spread here silently drops the extras.
for (const key of keys) scene.add(key);

const toggle = new CeramicToggle(96, 44);
scene.add(toggle);

function fit() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w === 0 || h === 0) return;
  scene.resize(w, h);
  const totalW = keys.length * KEY_W + (keys.length - 1) * 22;
  const left = (w - totalW) / 2;
  const top = h / 2 - KEY_H / 2 - 8;
  keys.forEach((key, i) => key.place(left + i * (KEY_W + 22), top));
  board.setPosition(left, top - 74);
  toggle.setPosition(left, top + KEY_H + 40);
  scene.markDirty();
}

const observer = new ResizeObserver(fit);
observer.observe(app);

scene.start();
