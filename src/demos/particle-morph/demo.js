import { Scene, Entity, ComputeParticleEntity } from "@vectojs/core";

/* ---- shape samplers (filled interior with perimeter bias) ---- */

function sampleCircle(cx, cy, r, n) {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = ((i + Math.random() * 0.5) / n) * Math.PI * 2;
    const rad = r * (0.25 + Math.random() * 0.75);
    pts[i * 2] = cx + Math.cos(a) * rad;
    pts[i * 2 + 1] = cy + Math.sin(a) * rad;
  }
  return pts;
}

function starRad(a, r) {
  return r * (0.675 + 0.325 * Math.cos(5 * (a + Math.PI / 2)));
}

function sampleStar(cx, cy, r, n) {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = ((i + Math.random() * 0.5) / n) * Math.PI * 2;
    const rad = starRad(a, r) * (0.4 + Math.random() * 0.6);
    pts[i * 2] = cx + Math.cos(a) * rad;
    pts[i * 2 + 1] = cy + Math.sin(a) * rad;
  }
  return pts;
}

function sampleHexagon(cx, cy, r, n) {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = ((i + Math.random() * 0.5) / n) * Math.PI * 2;
    const snap = Math.round(a / (Math.PI / 3)) * (Math.PI / 3);
    const rad = (r * (0.3 + Math.random() * 0.7)) / Math.cos((a - snap) * 0.6);
    const clampedRad = Math.min(rad, r);
    pts[i * 2] = cx + Math.cos(a) * clampedRad;
    pts[i * 2 + 1] = cy + Math.sin(a) * clampedRad;
  }
  return pts;
}

function sampleDiamond(cx, cy, r, n) {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const t = (i + Math.random() * 0.5) / n;
    const a = t * Math.PI * 2;
    const d =
      (r * (0.3 + Math.random() * 0.7)) /
      (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)) || 1);
    pts[i * 2] = cx + Math.cos(a) * d;
    pts[i * 2 + 1] = cy + Math.sin(a) * d;
  }
  return pts;
}

function sampleHeart(cx, cy, r, n) {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = ((i + Math.random() * 0.5) / n) * Math.PI * 2;
    const scale = (r / 18) * (0.25 + Math.random() * 0.75);
    const x = 16 * Math.pow(Math.sin(a), 3);
    const y =
      13 * Math.cos(a) -
      5 * Math.cos(2 * a) -
      2 * Math.cos(3 * a) -
      Math.cos(4 * a);
    pts[i * 2] = cx + x * scale;
    pts[i * 2 + 1] = cy - y * scale;
  }
  return pts;
}

function sampleSpiral(cx, cy, r, n) {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const t = (i + Math.random() * 0.5) / n;
    const a = t * Math.PI * 6;
    const rad = r * t * (0.5 + Math.random() * 0.5);
    pts[i * 2] = cx + Math.cos(a) * rad;
    pts[i * 2 + 1] = cy + Math.sin(a) * rad;
  }
  return pts;
}

function sampleTriangle(cx, cy, r, n) {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = ((i + Math.random() * 0.5) / n) * Math.PI * 2 + Math.PI / 2;
    const snap = Math.round(a / ((Math.PI * 2) / 3)) * ((Math.PI * 2) / 3);
    const rad =
      (r * (0.3 + Math.random() * 0.7)) / (Math.cos((a - snap) * 0.7) || 1);
    const clampedRad = Math.min(rad, r);
    pts[i * 2] = cx + Math.cos(a) * clampedRad;
    pts[i * 2 + 1] = cy + Math.sin(a) * clampedRad;
  }
  return pts;
}

/* ---- end shape samplers ---- */

const SHAPES = [
  { name: "Circle", fn: sampleCircle },
  { name: "Star", fn: sampleStar },
  { name: "Hexagon", fn: sampleHexagon },
  { name: "Diamond", fn: sampleDiamond },
  { name: "Heart", fn: sampleHeart },
  { name: "Spiral", fn: sampleSpiral },
  { name: "Triangle", fn: sampleTriangle },
];

class MorphController extends Entity {
  bucket = null;
  shapeIdx = 0;
  state = "display"; // display → explode → morph → display
  timer = 0;
  speed = 1;
  total = 1800;

  isPointInside() {
    return false;
  }
  hasPendingAnimations() {
    return true;
  }
  render() {}

  update(dt) {
    this.timer += dt;
    const W = this.scene.width;
    const H = this.scene.height;
    if (W === 0 || H === 0) return;
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) * 0.28;

    if (this.state === "display" && this.timer > 3500 / this.speed) {
      this.state = "explode";
      this.timer = 0;
      if (this.bucket) {
        this.bucket.triggerExplosion(cx, cy, 50000);
        this.scene.markDirty();
      }
    } else if (this.state === "explode" && this.timer > 350 / this.speed) {
      this.state = "morph";
      this.timer = 0;
      this.shapeIdx = (this.shapeIdx + 1) % SHAPES.length;
      if (this.bucket) {
        const points = SHAPES[this.shapeIdx].fn(cx, cy, r, this.total);
        this.bucket.setOrigins(points, false);
        this.scene.markDirty();
      }
    } else if (this.state === "morph" && this.timer > 700 / this.speed) {
      this.state = "display";
      this.timer = 0;
    }
  }

  rebuild(count) {
    this.total = count;
    const W = this.scene.width || 900;
    const H = this.scene.height || 500;
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) * 0.28;

    if (this.bucket) {
      this.scene.remove(this.bucket);
    }
    this.bucket = new ComputeParticleEntity({
      maxParticles: count,
      size: 2.8,
      color: "#d97757",
      springK: 0.08,
      damping: 0.7,
      bounceDamping: 0.3,
      maxVelocity: 800,
    });
    this.scene.add(this.bucket);
    this.bucket.initRandomParticles(W, H);
    const points = SHAPES[this.shapeIdx].fn(cx, cy, r, count);
    this.bucket.setOrigins(points, true);
    this.state = "display";
    this.timer = 0;
  }
}

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");
const hud = document.getElementById("hud");

const scene = new Scene(canvas, {
  renderMode: "always",
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

const controller = new MorphController();
scene.add(controller);
scene.start();

function rebuildScene() {
  const count = Number(document.getElementById("input-count").value);
  const W = app.clientWidth || 900;
  const H = app.clientHeight || 500;
  // Resize BEFORE rebuild: rebuild()'s shape geometry reads
  // this.scene.width/height for centering/radius — resizing after would
  // leave the initial shape computed against the stale (or 900x500
  // fallback) size, clustering all particles in a small sub-region until
  // the next resize event happens to fire.
  if (W > 0 && H > 0) scene.resize(W, H);
  controller.rebuild(count);
}

document.getElementById("input-count").addEventListener("input", () => {
  document.getElementById("value-count").textContent =
    document.getElementById("input-count").value;
});
document.getElementById("input-count").addEventListener("change", rebuildScene);

document.getElementById("input-speed").addEventListener("input", () => {
  controller.speed = Number(document.getElementById("input-speed").value) / 5;
  document.getElementById("value-speed").textContent =
    controller.speed.toFixed(1);
  scene.markDirty();
});

document.getElementById("input-color").addEventListener("input", () => {
  if (controller.bucket) {
    controller.bucket.baseColor = document.getElementById("input-color").value;
    scene.markDirty();
  }
});

const observer = new ResizeObserver(() => {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w > 0 && h > 0) {
    scene.resize(w, h);
    if (controller.bucket) {
      controller.bucket.width = w;
      controller.bucket.height = h;
    }
  }
});
observer.observe(app);

rebuildScene();

function updateHud() {
  const shapeName = SHAPES[controller.shapeIdx].name;
  const stateIcon =
    { display: "◉", explode: "✦", morph: "◈" }[controller.state] || "●";
  hud.textContent =
    `${controller.total} particles · ${shapeName} ${stateIcon}\n` +
    `auto-cycling every ${(3.5 / controller.speed).toFixed(1)}s · speed ${controller.speed.toFixed(1)}`;
  setTimeout(updateHud, 300);
}
updateHud();
