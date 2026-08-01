import { Scene, Entity } from '@vectojs/core';

// Glitch text, light-theme edition: instead of RGB-split-on-black, the burst
// reads as a misregistered PRINT — coral and teal plates slipping out of
// register, sliced scanbands, and dropout blocks. The clean glyphs are baked
// once per color into offscreen sprites; a burst composes them with raw
// Canvas2D (source-rect slices, multiply blending) into one buffer that the
// entity draws. Between bursts the scene is fully idle (onDemand): a timer
// arms the burst and hasPendingAnimations() carries it while it runs.

const app = document.getElementById('app');
const canvas = document.getElementById('canvas');

const TEXT = 'MOTIF';
const INK = '#2a2723';
const CORAL = '#d97757';
const TEAL = '#4d9d8f';
const MUTED = '#8a8073';
const SPRITE_SCALE = Math.min(window.devicePixelRatio || 1, 2);
const BURST_MS = 420;
const CALM_MIN_MS = 1400;
const CALM_VAR_MS = 1800;

class GlitchText extends Entity {
  constructor(text) {
    super('GlitchText');
    this.text = text;
    this.fontSize = 120;
    this.pad = 24; // sprite margin so slipped plates never clip
    this.interactive = true;
    this.plates = null; // { ink, coral, teal } offscreen sprites
    this.frame = document.createElement('canvas');
    this.fctx = this.frame.getContext('2d');
    this.burstUntil = 0;
    this.armed = 0;
  }

  // Bake the ink plate, then tint copies via source-in — one text raster,
  // three registration plates.
  bake(fontSize) {
    this.fontSize = fontSize;
    const s = SPRITE_SCALE;
    const font = `900 ${fontSize}px "Inter", system-ui, sans-serif`;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const metrics = probe.measureText(this.text);
    const w = Math.ceil(metrics.width) + this.pad * 2;
    const h = Math.ceil(fontSize * 1.2) + this.pad * 2;
    this.width = w;
    this.height = h;
    this.frame.width = w * s;
    this.frame.height = h * s;

    const bakePlate = (color) => {
      const c = document.createElement('canvas');
      c.width = w * s;
      c.height = h * s;
      const ctx = c.getContext('2d');
      ctx.scale(s, s);
      ctx.font = font;
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      ctx.fillText(this.text, this.pad, this.pad);
      return c;
    };
    this.plates = {
      ink: bakePlate(INK),
      coral: bakePlate(CORAL),
      teal: bakePlate(TEAL),
    };
  }

  burst() {
    this.burstUntil = performance.now() + BURST_MS;
    this.scene?.markDirty();
    // Self-perpetuating: each burst books the next one. A timer (not
    // update()) because in onDemand mode the scene stops ticking entirely
    // once the burst settles — there is no update to re-arm from.
    window.clearTimeout(this.armed);
    this.armed = window.setTimeout(
      () => this.burst(),
      BURST_MS + CALM_MIN_MS + Math.random() * CALM_VAR_MS,
    );
  }

  // The scene sleeps between bursts; this keeps it rendering during one.
  hasPendingAnimations() {
    return performance.now() < this.burstUntil || super.hasPendingAnimations();
  }

  destroy() {
    window.clearTimeout(this.armed);
    super.destroy();
  }

  // Compose one glitched frame. Intensity eases out over the burst so the
  // plates SNAP apart and settle back into register.
  composeGlitch() {
    const { fctx, plates } = this;
    const s = SPRITE_SCALE;
    const w = this.width * s;
    const h = this.height * s;
    const left = (this.burstUntil - performance.now()) / BURST_MS;
    const k = Math.max(0, Math.min(1, left)) ** 1.6; // ease intensity

    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, w, h);

    // Slipped color plates first, multiplied so overlaps darken like ink.
    const slip = 10 * s * k;
    fctx.globalCompositeOperation = 'multiply';
    fctx.drawImage(
      plates.coral,
      -slip + (Math.random() - 0.5) * 3 * s,
      (Math.random() - 0.5) * 2 * s,
    );
    fctx.drawImage(
      plates.teal,
      slip + (Math.random() - 0.5) * 3 * s,
      (Math.random() - 0.5) * 2 * s,
    );
    fctx.globalCompositeOperation = 'source-over';

    // Ink plate on top, torn into horizontal scanbands with jitter.
    const bands = 7;
    const bandH = Math.ceil(h / bands);
    for (let i = 0; i < bands; i++) {
      const sy = i * bandH;
      const jx = (Math.random() - 0.5) * 26 * s * k;
      fctx.drawImage(plates.ink, 0, sy, w, bandH, jx, sy, w, bandH);
    }

    // Dropout blocks: small rects where the "press" missed the paper.
    const blocks = Math.round(5 * k);
    fctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < blocks; i++) {
      fctx.fillRect(
        Math.random() * w,
        Math.random() * h,
        (10 + Math.random() * 60) * s,
        (3 + Math.random() * 8) * s,
      );
    }
    fctx.globalCompositeOperation = 'source-over';
  }

  isPointInside(gx, gy) {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  render(r) {
    if (!this.plates) return;
    if (performance.now() < this.burstUntil) {
      this.composeGlitch();
      r.drawImage(this.frame, 0, 0, this.width, this.height);
    } else {
      r.drawImage(this.plates.ink, 0, 0, this.width, this.height);
    }
  }

  // Even mid-glitch, the headline stays real text to the a11y tree, search,
  // and screen readers — the projection mirrors the string, not the pixels.
  getContentProjection() {
    return {
      text: this.text,
      font: `900 ${this.fontSize}px "Inter", system-ui, sans-serif`,
      contentX: this.pad,
      contentY: this.pad,
      baseline: this.pad + this.fontSize * 0.8,
    };
  }
}

const scene = new Scene(canvas, {
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});
// renderMode is a FIELD, not a SceneOptions key — passing it to the constructor
// is silently ignored and leaves the scene in 'always', which then idles at
// core's 2fps auto-throttle instead of 0.
scene.renderMode = 'onDemand';

const title = new GlitchText(TEXT);
scene.add(title);
title.on('pointerdown', () => title.burst());

class Caption extends Entity {
  isPointInside() {
    return false;
  }
  render(r) {
    r.fillText(
      'Misregistered print plates · click the headline to slip the press',
      0,
      0,
      '400 14px "Inter", sans-serif',
      MUTED,
    );
  }
}
const caption = new Caption('Caption');
scene.add(caption);

function layout() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  title.setPosition((w - title.width) / 2, (h - title.height) / 2 - 12);
  caption.setPosition((w - title.width) / 2 + title.pad, h / 2 + title.height / 2 + 24);
}

function fit() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w === 0 || h === 0) return;
  scene.resize(w, h);
  // Scale the headline to the stage: ~1/5 of width, clamped for legibility.
  title.bake(Math.max(64, Math.min(150, w * 0.19)));
  layout();
  scene.markDirty();
}

const observer = new ResizeObserver(fit);
observer.observe(app);

// Re-bake once webfonts land so the plates use real Inter Black, not the
// fallback that was measured before the font finished loading.
document.fonts?.ready.then(() => {
  if (app.clientWidth > 0) {
    title.bake(title.fontSize);
    layout();
    scene.markDirty();
  }
});

scene.start();

// First slip of the press; every burst after this books its own successor.
window.setTimeout(() => title.burst(), 900);
