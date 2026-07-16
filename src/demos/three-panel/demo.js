import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ThreeAdapter } from "@vectojs/three";
import { Card, Stack, Text, Button, Toggle } from "@vectojs/ui";

const app = document.getElementById("app");
const canvas = document.getElementById("canvas");

const PANEL_W = 640;
const PANEL_H = 400;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
// Cap DPR: a 3D-panel demo pays the render cost twice (WebGL scene + the
// VectoJS panel texture), so uncapped HiDPI backing stores blow the frame
// budget on retina displays — same DPR<=2 rule as the full-screen point demos.
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const threeScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 7);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 14;

const adapter = new ThreeAdapter({ width: PANEL_W, height: PANEL_H });
adapter.mesh.material.side = THREE.DoubleSide;
const aspect = PANEL_H / PANEL_W;
adapter.mesh.scale.set(4.4, 4.4 * aspect, 1);
threeScene.add(adapter.mesh);

buildPanel(adapter.vectoScene);

function buildPanel(scene) {
  scene.renderMode = "onDemand";
  const card = new Card({
    width: PANEL_W,
    height: PANEL_H,
    bg: "#14171f",
    border: "#7c5cff",
    borderWidth: 2,
    radius: 20,
    label: "Spatial panel",
  });
  const stack = new Stack({ direction: "vertical", gap: 16 });
  stack.setPosition(36, 40);
  stack.add(
    new Text("A live VectoJS UI, mapped onto a 3D plane.", {
      font: "18px sans-serif",
      color: "#f4f6f8",
    }),
  );
  stack.add(
    new Text(
      "Drag empty space to orbit. Click the controls — the raycaster forwards UV-mapped pointer events into the canvas UI.",
      { font: "14px sans-serif", color: "#9aa3b0", maxWidth: PANEL_W - 72 },
    ),
  );
  const status = new Text("Ready.", {
    font: "14px sans-serif",
    color: "#22d3ee",
  });
  stack.add(
    new Toggle({
      label: "Enable warp drive",
      accent: "#7c5cff",
      onChange: (v) => {
        status.text = v ? "Warp drive engaged." : "Warp drive idle.";
        scene.markDirty();
      },
    }),
  );
  stack.add(
    new Button("Launch probe", {
      bg: "#7c5cff",
      hoverBg: "#9a80ff",
      color: "#fff",
      font: "600 15px sans-serif",
      padding: 14,
      radius: 12,
      onClick: () => {
        status.text = "Probe launched \u2726";
        scene.markDirty();
      },
    }),
  );
  stack.add(status);
  card.add(stack);
  scene.add(card);
  scene.start();
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function toNDC(e) {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
}

canvas.addEventListener("pointermove", (e) => {
  toNDC(e);
  adapter.updateIntersection(raycaster, "pointermove", e);
});
canvas.addEventListener("click", (e) => {
  toNDC(e);
  adapter.updateIntersection(raycaster, "click", e);
});
// pointerdown/up are captured at the window (capture phase) so this runs BEFORE
// OrbitControls' own canvas pointerdown listener: a hit on a UI control
// suspends orbit so dragging a slider/toggle doesn't also rotate the camera.
window.addEventListener(
  "pointerdown",
  (e) => {
    toNDC(e);
    const hit = adapter.updateIntersection(raycaster, "pointerdown", e);
    if (hit) controls.enabled = false;
  },
  true,
);
window.addEventListener(
  "pointerup",
  (e) => {
    toNDC(e);
    adapter.updateIntersection(raycaster, "pointerup", e);
    controls.enabled = true;
  },
  true,
);

function fit() {
  const w = app.clientWidth || 1;
  const h = app.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(fit).observe(app);
fit();

function frame() {
  controls.update();
  renderer.render(threeScene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
