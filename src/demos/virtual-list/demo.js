import { Scene } from "@vectojs/core";
import { Card, Text, VirtualList } from "@vectojs/ui";

const canvas = document.getElementById("canvas");
const app = document.getElementById("app");

const scene = new Scene(canvas, { maxFPS: 60, disableWindowResize: true });
// Static list UI: paint on demand and let VirtualList's own scroll integrator
// (which overrides hasPendingAnimations) wake the loop while momentum runs.
scene.renderMode = "onDemand";

const CARD_W = 460;
const CARD_H = 320;
const PAD = 16;
const LIST_W = CARD_W - PAD * 2;
const ROW_H = 34;

const items = Array.from(
  { length: 5000 },
  (_, i) => `Virtualized command ${i + 1}`,
);

function rowText(value, index) {
  const row = new Card({
    width: LIST_W,
    height: ROW_H - 2,
    radius: 8,
    bg: index % 2 ? "rgba(20,23,31,0.7)" : "rgba(27,31,41,0.7)",
    border: "rgba(255,255,255,0.06)",
  });
  row.add(
    new Text(`${String(index + 1).padStart(4, "0")}  ${value}`, {
      font: '13px ui-monospace, "JetBrains Mono", monospace',
      color: "#cbd5e1",
    }).setPosition(12, 9),
  );
  return row;
}

const card = new Card({
  width: CARD_W,
  height: CARD_H,
  bg: "#14171f",
  border: "#26324a",
  borderWidth: 1,
  radius: 16,
  label: "Command palette",
});
card.add(
  new Text("5,000 rows — only the visible window is mounted", {
    font: "600 13px Inter, system-ui",
    color: "#9aa3b0",
  }).setPosition(PAD, PAD),
);

const list = new VirtualList({
  items,
  renderItem: rowText,
  estimatedRowHeight: ROW_H,
  overscan: 3,
  width: LIST_W,
  height: CARD_H - PAD * 2 - 28,
});
card.add(list.setPosition(PAD, PAD + 28));

scene.add(card);

function fit() {
  const w = app.clientWidth || 1;
  const h = app.clientHeight || 1;
  scene.resize(w, h);
  card.setPosition(Math.round((w - CARD_W) / 2), Math.round((h - CARD_H) / 2));
  scene.markDirty();
}

new ResizeObserver(fit).observe(app);
scene.start();
