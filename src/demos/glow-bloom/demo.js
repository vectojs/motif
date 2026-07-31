import { Scene, Entity } from '@vectojs/core';

class BloomPipeline extends Entity {
  brightCanvas = document.createElement('canvas');
  bloomCanvas = document.createElement('canvas');
  time = 0;
  blurRadius = 12;
  intensity = 0.4;
  glowColor = '#d97757';
  coreColor = '#ffffff';
  mouseX = -1;
  mouseY = -1;
  w = 0;
  h = 0;

  isPointInside() {
    return false;
  }
  hasPendingAnimations() {
    return true;
  }

  update(dt) {
    this.time += dt;
  }

  render(r) {
    const W = this.scene.width;
    const H = this.scene.height;
    if (W === 0 || H === 0) return;

    if (this._w !== W || this._h !== H) {
      this._w = W;
      this._h = H;
      this.brightCanvas.width = W;
      this.brightCanvas.height = H;
    }
    const blurW = Math.max(1, Math.round(W * 0.4));
    const blurH = Math.max(1, Math.round(H * 0.4));
    if (this._blurW !== blurW || this._blurH !== blurH) {
      this._blurW = blurW;
      this._blurH = blurH;
      this.bloomCanvas.width = blurW;
      this.bloomCanvas.height = blurH;
    }

    const bc = this.brightCanvas.getContext('2d');
    bc.clearRect(0, 0, W, H);
    this.drawBrightContent(bc, W, H, this.time * 0.001);

    const blc = this.bloomCanvas.getContext('2d');
    blc.clearRect(0, 0, blurW, blurH);
    blc.filter = `blur(${this.blurRadius}px)`;
    blc.drawImage(this.brightCanvas, 0, 0, blurW, blurH);
    blc.filter = 'none';

    const ctx = r.getContext();
    r.save();
    ctx.fillStyle = '#1a1a1e';
    ctx.fillRect(0, 0, W, H);
    r.globalAlpha = this.intensity;
    r.drawImage(this.bloomCanvas, 0, 0, W, H);
    r.globalAlpha = 1;
    // IRenderer.drawImage requires the full 5-arg (source, dx, dy, dw, dh)
    // signature — unlike native CanvasRenderingContext2D.drawImage, it has
    // no 3-arg overload, so omitting dw/dh passes them through as
    // `undefined` and the native call silently draws nothing (this was
    // why the sharp foreground never appeared, only the blurred bloom).
    r.drawImage(this.brightCanvas, 0, 0, W, H);
    r.restore();
  }

  drawBrightContent(ctx, W, H, t) {
    ctx.save();
    const cx = W / 2;
    const cy = H / 2;

    const fontSize = Math.min(96, W * 0.13);
    ctx.font = `900 ${fontSize}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.coreColor;
    ctx.fillText('BLOOM', cx, cy);

    const ringR = Math.min(W, H) * 0.35 + Math.sin(t * 1.5) * 8;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = this.glowColor;
    ctx.lineWidth = 2 + Math.sin(t * 2) * 1;
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + t * 0.8;
      const radius = Math.min(W, H) * 0.28;
      const ox = cx + Math.cos(angle) * radius;
      const oy = cy + Math.sin(angle) * radius;
      const size = 16 + Math.sin(t * 3 + i) * 5;
      ctx.beginPath();
      ctx.arc(ox, oy, size, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? this.glowColor : '#fff';
      ctx.fill();
    }

    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + t * 0.5;
      const radius = Math.min(W, H) * 0.42;
      const dx = cx + Math.cos(angle) * radius;
      const dy = cy + Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.arc(dx, dy, 3 + Math.sin(t * 2 + i) * 2, 0, Math.PI * 2);
      ctx.fillStyle = this.glowColor;
      ctx.fill();
    }

    if (this.mouseX >= 0 && this.mouseY >= 0) {
      const g = ctx.createRadialGradient(
        this.mouseX,
        this.mouseY,
        0,
        this.mouseX,
        this.mouseY,
        100,
      );
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(this.mouseX - 100, this.mouseY - 100, 200, 200);
    }

    ctx.restore();
  }
}

const app = document.getElementById('app');
const canvas = document.getElementById('canvas');
const blurInput = document.getElementById('input-blur');
const intenseInput = document.getElementById('input-intense');
const glowColorInput = document.getElementById('input-glow-color');
const coreColorInput = document.getElementById('input-core-color');

const scene = new Scene(canvas, {
  renderMode: 'always',
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

const bloom = new BloomPipeline();
scene.add(bloom);
scene.start();

blurInput.addEventListener('input', () => {
  bloom.blurRadius = Number(blurInput.value);
  document.getElementById('value-blur').textContent = `${bloom.blurRadius}px`;
});
intenseInput.addEventListener('input', () => {
  bloom.intensity = Number(intenseInput.value) / 20;
  document.getElementById('value-intense').textContent = bloom.intensity.toFixed(1);
});
glowColorInput.addEventListener('input', () => {
  bloom.glowColor = glowColorInput.value;
});
coreColorInput.addEventListener('input', () => {
  bloom.coreColor = coreColorInput.value;
});

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  bloom.mouseX = e.clientX - r.left;
  bloom.mouseY = e.clientY - r.top;
});
canvas.addEventListener('mouseleave', () => {
  bloom.mouseX = -1;
  bloom.mouseY = -1;
});

const observer = new ResizeObserver(() => {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w > 0 && h > 0) scene.resize(w, h);
});
observer.observe(app);

document.getElementById('hud').textContent =
  `bloom ${bloom.blurRadius}px · intensity ${bloom.intensity.toFixed(1)}\n` +
  `move mouse to paint glow`;
