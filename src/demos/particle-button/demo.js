import { Scene, ComputeParticleEntity } from "@vectojs/core";
import { Button } from "@vectojs/ui";

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");

function setSize() {
  canvas.width = app.offsetWidth;
  canvas.height = app.offsetHeight;
}
setSize();

// navigator.gpu is hidden on Firefox by no-ff-webgpu.js (its WebGPU backend can
// crash the GPU process), so this reliably distinguishes "GPU available" and
// lets us scale the burst down on the CPU fallback to stay smooth.
const canGPU = !!navigator.gpu;
const MAX_PARTICLES = canGPU ? 1200 : 350;

// ComputeParticleEntity draws through the WebGL point batch, so this scene
// needs pointBackend:'webgl'. The Firefox GPU-process crash is handled by
// no-ff-webgpu.js (loaded first in index.html) forcing the CPU sim path; this
// is an animating demo, not a static catalog, so it isn't exposed to the
// idle-60fps WebGL->2D composite bug that hit the gallery.
const scene = new Scene(canvas, {
  renderMode: "always",
  pointBackend: "webgl",
  maxFPS: 60,
});

const sparks = new ComputeParticleEntity({
  maxParticles: MAX_PARTICLES,
  ...(canGPU ? {} : { particleBackend: "cpu" }),
  springK: 0.035,
  damping: 0.9,
  maxVelocity: 700,
  size: 3,
  color: "#7c5cff",
});
scene.add(sparks);

function burst() {
  // Shove the ambient field outward from the button center; each particle's
  // spring then reels it back to its own spread-out origin. (Don't re-home
  // origins here — that would permanently collapse the whole field onto the
  // button.)
  sparks.triggerExplosion(
    button.x + button.width / 2,
    button.y + button.height / 2,
    620,
  );
}

const button = new Button("\u2726 Launch", {
  bg: "#7c5cff",
  hoverBg: "#8b6dff",
  color: "#ffffff",
  font: '700 16px "Inter", sans-serif',
  padding: 16,
  radius: 12,
  onClick: burst,
});
scene.add(button);

function layout() {
  button.setPosition(
    (canvas.width - button.width) / 2,
    (canvas.height - button.height) / 2,
  );
}

// Defer sizing + particle init to the next frame so the iframe's layout has
// settled and (on WebGPU) the device is ready before the buffer is seeded —
// mirrors the vectojs-website particles sandbox.
function fit() {
  setSize();
  scene.resize(canvas.width, canvas.height);
  sparks.initRandomParticles(canvas.width, canvas.height);
  layout();
}
window.addEventListener("resize", fit);
requestAnimationFrame(fit);

scene.start();
