import { Scene, Entity } from "@vectojs/core";

class RippleText extends Entity {
  text = "RIPPLE";
  freq = 0.06;
  amplitude = 14;
  speed = 2.5;
  time = 0;
  fontSize = 90;
  colorA = "#d97757";
  colorB = "#38bdf8";

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
    const ctx = r.getContext();
    const chars = [...this.text];
    if (chars.length === 0) return;
    ctx.save();
    const fs = Math.min(this.fontSize, this.scene.width * 0.12);
    ctx.font = `900 ${fs}px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = "middle";

    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const totalW = widths.reduce((s, w) => s + w, 0) + (chars.length - 1) * 2;
    const startX = (this.scene.width - totalW) / 2;
    let cx = startX;
    const cy = this.scene.height / 2;

    for (let i = 0; i < chars.length; i++) {
      const w = widths[i];
      const xPos = cx + w / 2;
      // Gradient position must be relative to the text's OWN span —
      // distance walked from the word's first character (xPos - startX,
      // where startX is fixed at the word's left edge), not xPos itself.
      // xPos is an absolute canvas coordinate starting around half the
      // canvas width, so dividing it directly by totalW (just the text's
      // width) overshot past 1.0 for every character and rendered the
      // whole word in colorB only.
      const t = totalW > 0 ? (xPos - startX) / totalW : 0;
      const yOff =
        Math.sin(xPos * this.freq + this.time * this.speed * 0.001) *
          this.amplitude *
          0.5 +
        Math.sin(xPos * this.freq * 1.7 + this.time * this.speed * 0.0013) *
          this.amplitude *
          0.3 +
        Math.sin(xPos * this.freq * 0.4 + this.time * this.speed * 0.0007) *
          this.amplitude *
          0.2;

      ctx.save();
      ctx.translate(xPos, cy + yOff);
      ctx.fillStyle = lerpColor(this.colorA, this.colorB, t);
      ctx.textAlign = "center";
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
      cx += w + 2;
    }

    ctx.restore();
  }
}

function lerpColor(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");
const hud = document.getElementById("hud");
const textInput = document.getElementById("input-text");
const freqInput = document.getElementById("input-freq");
const ampInput = document.getElementById("input-amp");
const speedInput = document.getElementById("input-speed");
const colorAInput = document.getElementById("input-color-a");
const colorBInput = document.getElementById("input-color-b");

const scene = new Scene(canvas, {
  renderMode: "always",
  maxFPS: 60,
  disableWindowResize: true,
  maxDPR: 2,
});

const ripple = new RippleText();
scene.add(ripple);
scene.start();

textInput.addEventListener("input", () => {
  ripple.text = textInput.value.toUpperCase() || "RIPPLE";
});
freqInput.addEventListener("input", () => {
  ripple.freq = Number(freqInput.value) / 100;
  document.getElementById("value-freq").textContent = ripple.freq.toFixed(2);
});
ampInput.addEventListener("input", () => {
  ripple.amplitude = Number(ampInput.value);
  document.getElementById("value-amp").textContent = `${ripple.amplitude}px`;
});
speedInput.addEventListener("input", () => {
  ripple.speed = Number(speedInput.value) / 10;
  document.getElementById("value-speed").textContent = ripple.speed.toFixed(1);
});
colorAInput.addEventListener("input", () => {
  ripple.colorA = colorAInput.value;
});
colorBInput.addEventListener("input", () => {
  ripple.colorB = colorBInput.value;
});

const observer = new ResizeObserver(() => {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w > 0 && h > 0) scene.resize(w, h);
});
observer.observe(app);

function updateHud() {
  hud.textContent =
    `"${ripple.text}" · ${ripple.text.length} chars\n` +
    `wave ${ripple.freq.toFixed(2)} · amp ${ripple.amplitude}px · speed ${ripple.speed.toFixed(1)}`;
  setTimeout(updateHud, 250);
}
updateHud();
