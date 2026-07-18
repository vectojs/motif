import { Scene, Entity } from "@vectojs/core";

// Liquid glass: a draggable frosted card that REFRACTS the scene behind it.
// IRenderer has no backdrop-filter, so the trick is layering:
//   1. the wallpaper paints itself into an offscreen canvas every frame,
//   2. a Wallpaper entity blits that offscreen to the scene (what you see),
//   3. the GlassCard samples the SAME offscreen under its own rect, blurs and
//      magnifies it into a private compose buffer, bends the edges, masks it
//      to a rounded rect, and draws the result — glass over live content.
// The engine drives everything else: the spring-lagged drag (setTransition),
// pointer events, and the render loop.

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");

const CREAM = "#f7f4ee";
const INK = "#2a2723";
const MUTED = "#8a8073";

// Drifting color field. Warm brand hues on cream — the glass has something
// colorful to bend without leaving the site's light palette.
const BLOBS = [
  { color: "#d97757", r: 260, ox: 0.28, oy: 0.34, ax: 90, ay: 60, s: 0.21 },
  { color: "#f2b880", r: 300, ox: 0.72, oy: 0.28, ax: 70, ay: 80, s: 0.17 },
  { color: "#7fb6a4", r: 240, ox: 0.62, oy: 0.75, ax: 110, ay: 55, s: 0.26 },
  { color: "#e9d8a6", r: 210, ox: 0.2, oy: 0.78, ax: 60, ay: 70, s: 0.31 },
];

// One shared backing-store scale for every offscreen buffer. Capped at 2 for
// the same reason the scene uses maxDPR: 2 — blur cost grows with pixels and
// 2x is already retina-crisp.
const BUF_SCALE = Math.min(window.devicePixelRatio || 1, 2);

class Wallpaper extends Entity {
  constructor() {
    super("Wallpaper");
    this.buffer = document.createElement("canvas");
    this.ctx = this.buffer.getContext("2d");
    this.time = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.buffer.width = Math.max(1, Math.round(width * BUF_SCALE));
    this.buffer.height = Math.max(1, Math.round(height * BUF_SCALE));
  }

  update(dt) {
    this.time += dt / 1000;
    const { ctx, buffer } = this;
    ctx.setTransform(BUF_SCALE, 0, 0, BUF_SCALE, 0, 0);
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, this.width, this.height);
    for (const b of BLOBS) {
      const cx = b.ox * this.width + Math.sin(this.time * b.s * 2) * b.ax;
      const cy = b.oy * this.height + Math.cos(this.time * b.s * 1.6) * b.ay;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r);
      grad.addColorStop(0, b.color);
      grad.addColorStop(1, "rgba(247, 244, 238, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - b.r, cy - b.r, b.r * 2, b.r * 2);
    }
    // A faint dot lattice gives the refraction fine detail to distort.
    ctx.fillStyle = "rgba(42, 39, 35, 0.14)";
    for (let gx = 20; gx < this.width; gx += 36) {
      for (let gy = 20; gy < this.height; gy += 36) {
        ctx.fillRect(gx, gy, 2, 2);
      }
    }
    void buffer;
  }

  isPointInside() {
    return false;
  }

  render(r) {
    if (this.buffer.width > 1)
      r.drawImage(this.buffer, 0, 0, this.width, this.height);
  }
}

class GlassCard extends Entity {
  constructor(wallpaper, width, height) {
    super("GlassCard");
    this.wallpaper = wallpaper;
    this.width = width;
    this.height = height;
    this.radius = 26;
    this.interactive = true;
    this.compose = document.createElement("canvas");
    this.compose.width = Math.round(width * BUF_SCALE);
    this.compose.height = Math.round(height * BUF_SCALE);
    this.cctx = this.compose.getContext("2d");
    // The liquid feel: position is spring-driven, so the card lags and
    // settles behind the pointer instead of teleporting with it.
    this.setTransition({
      x: { stiffness: 170, damping: 17 },
      y: { stiffness: 170, damping: 17 },
    });

    // The capsule on the glass is a REAL slider (0..1), not a static prop —
    // a fixed-fill decoration painted a moving-looking knob without any
    // drag logic behind it, reading as broken interactive UI. draggingSlider
    // disambiguates "grabbed the knob" from "grabbed the card body" for the
    // shared pointerdown/pointermove pair wired up below.
    this.sliderValue = 0.62;
    this.draggingSlider = false;
  }

  // Local-space geometry the slider track occupies — shared by hit-testing,
  // dragging, and rendering so all three always agree.
  sliderTrackRect() {
    const trackW = this.width - 52;
    return { x: 26, y: this.height - 58, w: trackW, h: 10 };
  }

  isPointInside(gx, gy) {
    const p = this.worldToLocal(gx, gy);
    return (
      !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height
    );
  }

  // Hit-test the knob specifically (a padded circle around its center), used
  // to decide whether a pointerdown starts a slider drag instead of a card
  // drag.
  isPointOnKnob(gx, gy) {
    const p = this.worldToLocal(gx, gy);
    if (!p) return false;
    const t = this.sliderTrackRect();
    const knobX = t.x + t.w * this.sliderValue;
    const knobY = t.y + t.h / 2;
    const dx = p.x - knobX;
    const dy = p.y - knobY;
    return dx * dx + dy * dy <= 14 * 14;
  }

  setSliderFromLocalX(localX) {
    const t = this.sliderTrackRect();
    const v = (localX - t.x) / t.w;
    this.sliderValue = Math.max(0, Math.min(1, v));
    this.scene?.markDirty();
  }

  // Rebuild the glass surface from the live wallpaper buffer. All the raw
  // Canvas2D work (filter blur, composite masking) happens in the private
  // compose buffer; the scene only ever sees one drawImage.
  refract() {
    const wp = this.wallpaper.buffer;
    if (wp.width <= 1) return;
    const { cctx } = this;
    const w = this.width;
    const h = this.height;
    const s = BUF_SCALE;
    // Springs write fractional positions; sample from the rendered position.
    const px = this.x;
    const py = this.y;

    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.globalCompositeOperation = "source-over";
    cctx.filter = "none";
    cctx.clearRect(0, 0, this.compose.width, this.compose.height);

    // Body: blur + saturate + slight magnification (sample a rect a bit
    // smaller than the card and stretch it) — light "gathers" behind glass.
    const mag = 0.94;
    const sx = (px + (w * (1 - mag)) / 2) * s;
    const sy = (py + (h * (1 - mag)) / 2) * s;
    cctx.filter = "blur(14px) saturate(1.5) brightness(1.06)";
    cctx.drawImage(
      wp,
      sx,
      sy,
      w * mag * s,
      h * mag * s,
      -12,
      -12,
      w * s + 24,
      h * s + 24,
    );

    // Edge bend: re-draw thin strips from sources displaced OUTWARD, so the
    // last pixels before the rim smear sideways the way thick glass bends
    // grazing light.
    cctx.filter = "blur(5px) saturate(1.5)";
    const bend = 14;
    const strip = 20;
    // left, right
    cctx.drawImage(
      wp,
      (px - bend) * s,
      py * s,
      strip * s,
      h * s,
      0,
      0,
      strip * s,
      h * s,
    );
    cctx.drawImage(
      wp,
      (px + w - strip + bend) * s,
      py * s,
      strip * s,
      h * s,
      (w - strip) * s,
      0,
      strip * s,
      h * s,
    );
    // top, bottom
    cctx.drawImage(
      wp,
      px * s,
      (py - bend) * s,
      w * s,
      strip * s,
      0,
      0,
      w * s,
      strip * s,
    );
    cctx.drawImage(
      wp,
      px * s,
      (py + h - strip + bend) * s,
      w * s,
      strip * s,
      0,
      (h - strip) * s,
      w * s,
      strip * s,
    );
    cctx.filter = "none";

    // Frost: a whisper of white so the glass reads as a material, not a lens.
    cctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    cctx.fillRect(0, 0, w * s, h * s);

    // Mask everything above to the rounded-rect footprint.
    cctx.globalCompositeOperation = "destination-in";
    cctx.beginPath();
    cctx.roundRect(0, 0, w * s, h * s, this.radius * s);
    cctx.fill();
    cctx.globalCompositeOperation = "source-over";
  }

  render(r) {
    this.refract();
    const w = this.width;
    const h = this.height;
    r.drawImage(this.compose, 0, 0, w, h);

    // Specular rim: bright top-left fading out — drawn by the engine renderer.
    const rim = r.createLinearGradient(0, 0, w * 0.35, h, [
      { stop: 0, color: "rgba(255, 255, 255, 0.9)" },
      { stop: 0.5, color: "rgba(255, 255, 255, 0.25)" },
      { stop: 1, color: "rgba(255, 255, 255, 0.45)" },
    ]);
    r.beginPath();
    r.roundRect(0.75, 0.75, w - 1.5, h - 1.5, this.radius);
    r.stroke(rim, 1.5);

    // Top highlight band — the "polished" streak.
    const gloss = r.createLinearGradient(0, 0, 0, h * 0.4, [
      { stop: 0, color: "rgba(255, 255, 255, 0.34)" },
      { stop: 1, color: "rgba(255, 255, 255, 0)" },
    ]);
    r.beginPath();
    r.roundRect(3, 3, w - 6, h * 0.4, [
      this.radius - 3,
      this.radius - 3,
      18,
      18,
    ]);
    r.fill(gloss);

    // Card content, to prove the glass is a working surface.
    r.fillText("Liquid Glass", 26, 52, '700 26px "Inter", sans-serif', INK);
    r.fillText(
      "drag me around the field",
      26,
      78,
      '400 14px "Inter", sans-serif',
      "rgba(42, 39, 35, 0.62)",
    );
    // A real capsule slider on the glass — track, fill, and knob all read
    // from this.sliderValue (dragged via the pointer handlers below).
    const track = this.sliderTrackRect();
    r.beginPath();
    r.roundRect(track.x, track.y, track.w, track.h, 5);
    r.fill("rgba(255, 255, 255, 0.5)");
    const fillGrad = r.createLinearGradient(26, 0, w - 26, 0, [
      { stop: 0, color: "#d97757" },
      { stop: 1, color: "#f2b880" },
    ]);
    r.beginPath();
    r.roundRect(track.x, track.y, track.w * this.sliderValue, track.h, 5);
    r.fill(fillGrad);
    r.fillCircle(
      track.x + track.w * this.sliderValue,
      track.y + track.h / 2,
      9,
      "#ffffff",
    );
    r.flush();
  }
}

const scene = new Scene(canvas, {
  renderMode: "always", // the wallpaper drifts continuously
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

const wallpaper = new Wallpaper();
scene.add(wallpaper);

const card = new GlassCard(wallpaper, 340, 220);
scene.add(card);

// Drag: pointermove is tracked on the window so a fast drag that leaves the
// card (springs lag!) keeps working until release. A pointerdown ON THE KNOB
// starts a slider drag instead of a card drag — checked first since the knob
// sits inside the card's own hit area.
let grab = null;
card.on("pointerdown", (e) => {
  if (
    e.sceneX !== undefined &&
    e.sceneY !== undefined &&
    card.isPointOnKnob(e.sceneX, e.sceneY)
  ) {
    card.draggingSlider = true;
    return;
  }
  grab = { dx: e.sceneX - card.x, dy: e.sceneY - card.y };
});
window.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  if (card.draggingSlider) {
    const local = card.worldToLocal(
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
    if (local) card.setSliderFromLocalX(local.x);
    return;
  }
  if (!grab) return;
  // Assignments animate: the spring transition retargets in flight.
  card.x = e.clientX - rect.left - grab.dx;
  card.y = e.clientY - rect.top - grab.dy;
});
window.addEventListener("pointerup", () => {
  grab = null;
  card.draggingSlider = false;
});

class Caption extends Entity {
  isPointInside() {
    return false;
  }
  render(r) {
    r.fillText(
      "Backdrop refraction, composed live from the scene behind the card.",
      0,
      0,
      '400 13px "Inter", sans-serif',
      MUTED,
    );
  }
}
const caption = new Caption("Caption");
scene.add(caption);

function fit() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w === 0 || h === 0) return;
  scene.resize(w, h);
  wallpaper.resize(w, h);
  // Keep the card reachable after a resize; teleport (no spring) on layout.
  const cx = Math.min(card.x, Math.max(16, w - card.width - 16));
  const cy = Math.min(card.y, Math.max(16, h - card.height - 16));
  if (card.x === 0 && card.y === 0) {
    card.setPosition((w - card.width) / 2, (h - card.height) / 2);
  } else {
    card.setPosition(cx, cy);
  }
  caption.setPosition(20, h - 18);
}

const observer = new ResizeObserver(fit);
observer.observe(app);

scene.start();
