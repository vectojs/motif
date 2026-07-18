import { Scene, Entity } from "@vectojs/core";

// Jelly buttons: each blob's outline is a ring of mass-spring points around a
// rest circle. Poke it and the impulse travels around the rim; neighboring
// points drag each other, so the whole surface ripples like set gelatin.
// Everything is entity-local math: update() integrates the springs,
// isPointInside() hit-tests the DEFORMED outline (not a box), and
// hasPendingAnimations() keeps the scene awake exactly while there is motion.

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");

const MUTED = "#8a8073";

const POINTS = 14;
const STIFFNESS = 130; // pull toward each point's rest radius
const NEIGHBOR = 60; // shear coupling between adjacent points
const DAMPING = 8.5;

function hexToRGBA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

class JellyButton extends Entity {
  constructor(label, color, radius) {
    super(`Jelly:${label}`);
    this.label = label;
    this.color = color;
    this.baseRadius = radius;
    this.width = radius * 2;
    this.height = radius * 2;
    this.interactive = true;
    this.pokes = 0;
    // Ring state: radial offset + velocity per perimeter point.
    this.offset = new Float32Array(POINTS);
    this.velocity = new Float32Array(POINTS);
    this.pts = []; // current outline, rebuilt each update
    for (let i = 0; i < POINTS; i++) this.pts.push({ x: 0, y: 0 });
    this.rebuildOutline();

    this.on("pointerdown", (e) => {
      this.poke(e.localX, e.localY);
      this.pokes += 1;
    });
  }

  // Radial impulse, strongest at the rim point nearest the hit, falling off
  // around the ring — this is what makes the wobble travel.
  poke(lx, ly) {
    const angle = Math.atan2(ly - this.baseRadius, lx - this.baseRadius);
    for (let i = 0; i < POINTS; i++) {
      const a = (i / POINTS) * Math.PI * 2;
      let d = Math.abs(a - angle);
      if (d > Math.PI) d = Math.PI * 2 - d;
      const falloff = Math.exp(-d * d * 2.2);
      this.velocity[i] -= 340 * falloff; // dent inward at the poke...
      const opposite = Math.exp(-(Math.PI - d) * (Math.PI - d) * 2.2);
      this.velocity[i] += 240 * opposite; // ...bulge outward opposite it
    }
    this.scene?.markDirty();
  }

  hasPendingAnimations() {
    for (let i = 0; i < POINTS; i++) {
      if (Math.abs(this.offset[i]) > 0.05 || Math.abs(this.velocity[i]) > 0.05)
        return true;
    }
    return super.hasPendingAnimations();
  }

  update(dt, time) {
    super.update(dt, time);
    const step = Math.min(dt, 32) / 1000;
    const { offset, velocity } = this;
    for (let i = 0; i < POINTS; i++) {
      const prev = offset[(i + POINTS - 1) % POINTS];
      const next = offset[(i + 1) % POINTS];
      const accel =
        -offset[i] * STIFFNESS +
        (prev + next - 2 * offset[i]) * NEIGHBOR -
        velocity[i] * DAMPING;
      velocity[i] += accel * step;
    }
    for (let i = 0; i < POINTS; i++) offset[i] += velocity[i] * step;
    this.rebuildOutline();
  }

  rebuildOutline() {
    const c = this.baseRadius;
    for (let i = 0; i < POINTS; i++) {
      const a = (i / POINTS) * Math.PI * 2;
      const r = this.baseRadius + this.offset[i];
      this.pts[i].x = c + Math.cos(a) * r;
      this.pts[i].y = c + Math.sin(a) * r;
    }
  }

  // Hit-test the deformed outline: ray-cast in LOCAL space against the
  // current polygon, so a dented jelly really has a dented hit area.
  isPointInside(gx, gy) {
    const p = this.worldToLocal(gx, gy);
    if (!p) return false;
    let inside = false;
    for (let i = 0, j = POINTS - 1; i < POINTS; j = i++) {
      const a = this.pts[i];
      const b = this.pts[j];
      if (
        a.y > p.y !== b.y > p.y &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      )
        inside = true;
    }
    return inside;
  }

  // Closed Catmull-Rom through the ring, emitted as cubic beziers — the
  // standard smooth-through-points conversion (tension 1/6).
  tracePath(r) {
    const pts = this.pts;
    r.beginPath();
    r.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < POINTS; i++) {
      const p0 = pts[(i + POINTS - 1) % POINTS];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % POINTS];
      const p3 = pts[(i + 2) % POINTS];
      r.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6,
        p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6,
        p2.y - (p3.y - p1.y) / 6,
        p2.x,
        p2.y,
      );
    }
    r.closePath();
  }

  render(r) {
    const d = this.baseRadius * 2;
    // Body: translucent top → dense bottom, like light through gelatin.
    const body = r.createLinearGradient(0, 0, 0, d, [
      { stop: 0, color: hexToRGBA(this.color, 0.5) },
      { stop: 0.55, color: hexToRGBA(this.color, 0.78) },
      { stop: 1, color: hexToRGBA(this.color, 0.95) },
    ]);
    this.tracePath(r);
    r.fill(body);
    this.tracePath(r);
    r.stroke(hexToRGBA(this.color, 0.9), 2);

    // Gloss: a soft highlight that squishes with the top rim points.
    // IRenderer has no createRadialGradient, so approximate one with
    // concentric, shrinking, fading circles instead of a single opaque
    // disk — filling one circle with a vertical LINEAR gradient left a
    // crisp, fully-opaque edge at the top of the disk (the gradient's alpha
    // only fades going down, never radially), reading as "a small circle
    // sitting on the jelly" rather than a soft sheen.
    const topY = Math.min(this.pts[10].y, this.pts[11].y);
    const glossR = this.baseRadius * 0.56;
    const glossCx = this.baseRadius;
    const glossCy = topY + d * 0.2;
    const RINGS = 14;
    for (let i = RINGS; i >= 1; i--) {
      const frac = i / RINGS;
      const alpha = 0.5 * (1 - frac) * (1 - frac) * (1 - frac);
      if (alpha <= 0.004) continue;
      r.beginPath();
      r.arc(glossCx, glossCy, glossR * frac, 0, Math.PI * 2);
      r.fill(`rgba(255, 255, 255, ${alpha.toFixed(3)})`);
    }

    const label = this.pokes > 0 ? `×${this.pokes}` : this.label;
    r.fillText(
      label,
      this.baseRadius - label.length * 5.5,
      this.baseRadius + 7,
      '700 19px "Inter", sans-serif',
      "rgba(255, 255, 255, 0.96)",
    );
  }
}

const scene = new Scene(canvas, {
  renderMode: "onDemand", // hasPendingAnimations() wakes it while wobbling
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

const jellies = [
  new JellyButton("poke", "#d97757", 74),
  new JellyButton("me", "#7fb6a4", 56),
  new JellyButton("too", "#f2b880", 46),
];
// One at a time: Scene.add takes a single entity (unlike the variadic
// Entity.add) — in plain JS a spread here silently drops the extras.
for (const jelly of jellies) scene.add(jelly);

class Caption extends Entity {
  isPointInside() {
    return false;
  }
  render(r) {
    r.fillText(
      "Mass-spring rims · hit-testing follows the deformed outline",
      0,
      0,
      '400 14px "Inter", sans-serif',
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
  const cy = h / 2 + 10;
  const gap = 46;
  const total =
    jellies.reduce((sum, j) => sum + j.baseRadius * 2, 0) +
    gap * (jellies.length - 1);
  let x = (w - total) / 2;
  for (const j of jellies) {
    j.setPosition(x, cy - j.baseRadius);
    x += j.baseRadius * 2 + gap;
  }
  caption.setPosition((w - total) / 2, cy - 150);
  scene.markDirty();
}

const observer = new ResizeObserver(fit);
observer.observe(app);

scene.start();
