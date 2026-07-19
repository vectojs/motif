import { Scene, Entity } from "@vectojs/core";

class GradientBg extends Entity {
  isPointInside() {
    return false;
  }
  render(r) {
    const ctx = r.getContext();
    const W = this.scene.width;
    const H = this.scene.height;
    ctx.fillStyle = "#f7f4ee";
    ctx.fillRect(0, 0, W, H);
    const blobs = [
      { x: W * 0.18, y: H * 0.25, r: Math.min(W, H) * 0.4, c: "#d97757" },
      { x: W * 0.75, y: H * 0.65, r: Math.min(W, H) * 0.35, c: "#38bdf8" },
      { x: W * 0.5, y: H * 0.15, r: Math.min(W, H) * 0.25, c: "#f2b880" },
      { x: W * 0.85, y: H * 0.2, r: Math.min(W, H) * 0.2, c: "#a78bfa" },
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

let grainCache = null;
let grainW = 0;
let grainH = 0;

function getGrain(w, h) {
  if (grainCache && grainW === w && grainH === h) return grainCache;
  grainW = w;
  grainH = h;
  grainCache = document.createElement("canvas");
  grainCache.width = w;
  grainCache.height = h;
  const ctx = grainCache.getContext("2d");
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
  return grainCache;
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
  tilt = 0;

  constructor(x, y, w, h, tilt) {
    super("FrostedPanel");
    this.baseX = x;
    this.baseY = y;
    this._x = x;
    this._y = y;
    this.pw = w;
    this.ph = h;
    this.tilt = tilt || 0;
  }

  isPointInside(px, py) {
    const dx = px - this._x;
    const dy = py - this._y;
    const rad = (-this.tilt * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return rx >= 0 && rx <= this.pw && ry >= 0 && ry <= this.ph;
  }

  render(r) {
    const ctx = r.getContext();
    r.save();
    r.translate(this._x, this._y);
    r.rotate((this.tilt * Math.PI) / 180);

    roundedRect(ctx, 0, 0, this.pw, this.ph, this.cr);
    ctx.clip();

    const bg = document.createElement("canvas");
    bg.width = this.pw;
    bg.height = this.ph;
    const bctx = bg.getContext("2d");
    bctx.drawImage(
      ctx.canvas,
      this._x,
      this._y,
      this.pw,
      this.ph,
      0,
      0,
      this.pw,
      this.ph,
    );
    bctx.filter = `blur(${this.blurRadius}px)`;
    bctx.drawImage(bg, 0, 0);
    bctx.filter = "none";
    r.drawImage(bg, 0, 0);

    ctx.fillStyle = `rgba(255,255,255,${this.tintOpacity})`;
    ctx.fillRect(0, 0, this.pw, this.ph);

    if (this.grainIntensity > 0) {
      const grain = getGrain(this.pw, this.ph);
      r.globalAlpha = Math.min(1, this.grainIntensity * 3);
      r.drawImage(grain, 0, 0);
      r.globalAlpha = 1;
    }

    r.strokeStyle = "rgba(255,255,255,0.25)";
    r.lineWidth = 1.5;
    roundedRect(ctx, 0.5, 0.5, this.pw - 1, this.ph - 1, this.cr);
    r.stroke();

    r.restore();
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

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");

const scene = new Scene(canvas, {
  renderMode: "always",
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

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

canvas.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i];
    if (p.isPointInside(mx, my)) {
      dragging = p;
      dragOffX = mx - p._x;
      dragOffY = my - p._y;
      scene.remove(p);
      scene.add(p);
      panels.splice(i, 1);
      panels.push(p);
      break;
    }
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const r = canvas.getBoundingClientRect();
  dragging._x = e.clientX - r.left - dragOffX;
  dragging._y = e.clientY - r.top - dragOffY;
});
canvas.addEventListener("pointerup", () => {
  dragging = null;
});
canvas.addEventListener("pointerleave", () => {
  dragging = null;
});

const blurInput = document.getElementById("input-blur");
const grainInput = document.getElementById("input-grain");
const tintInput = document.getElementById("input-tint");

function updateAllPanels() {
  for (const p of panels) {
    p.blurRadius = Number(blurInput.value);
    p.grainIntensity = Number(grainInput.value) / 100;
    p.tintOpacity = Number(tintInput.value) / 100;
  }
}

blurInput.addEventListener("input", () => {
  document.getElementById("value-blur").textContent = `${blurInput.value}px`;
  updateAllPanels();
});
grainInput.addEventListener("input", () => {
  document.getElementById("value-grain").textContent = (
    Number(grainInput.value) / 100
  ).toFixed(2);
  updateAllPanels();
});
tintInput.addEventListener("input", () => {
  document.getElementById("value-tint").textContent = (
    Number(tintInput.value) / 100
  ).toFixed(2);
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

document.getElementById("hud").textContent =
  "drag panels to rearrange · blur/grain/tint adjustable";
