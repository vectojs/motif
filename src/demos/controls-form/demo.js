import { Scene } from "@vectojs/core";
import { Stack, Card, Text, Input, Slider, Toggle, Button } from "@vectojs/ui";

const app = document.querySelector("#app");
const canvas = document.querySelector("#canvas");

// Static form UI: repaint only on interaction, never per frame. `markDirty()`
// after any state change is the onDemand contract — the engine idles at ~0 CPU
// between edits instead of burning a 60fps loop on a motionless panel.
const scene = new Scene(canvas, { disableWindowResize: true });
scene.renderMode = "onDemand";

const CARD_W = 360;
const PAD = 24;
const ROW = 12;

const card = new Card({
  width: CARD_W,
  height: 300,
  bg: "#0f1218",
  border: "#1b1f29",
  radius: 16,
  label: "Notification settings",
});

const form = new Stack({ direction: "vertical", gap: ROW, align: "start" });
form.setPosition(PAD, PAD);

const title = new Text("Notification settings", {
  font: "700 18px Inter, sans-serif",
  color: "#f4f6f8",
});

const nameInput = new Input({
  width: CARD_W - PAD * 2,
  placeholder: "Display name",
  value: "Ada Lovelace",
  bg: "#14171f",
  border: "#26324a",
  radius: 10,
});

const volume = new Slider({
  min: 0,
  max: 100,
  value: 70,
  width: CARD_W - PAD * 2,
});

const emailToggle = new Toggle({
  checked: true,
  label: "Email alerts",
  accent: "#7c5cff",
  onChange: () => scene.markDirty(),
});

const saveBtn = new Button("Save changes", {
  bg: "#7c5cff",
  hoverBg: "#8f74ff",
  color: "#ffffff",
  radius: 10,
  padding: 14,
  onClick: () => {
    saved.text = `Saved “${nameInput.value}” · vol ${Math.round(volume.value)} · email ${emailToggle.checked ? "on" : "off"}`;
    scene.markDirty();
  },
});

const saved = new Text("", {
  font: "13px Inter, sans-serif",
  color: "#22d3ee",
});

form.add(title);
form.add(nameInput);
form.add(volume);
form.add(emailToggle);
form.add(saveBtn);
form.add(saved);
card.add(form);
scene.add(card);

function fit() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w === 0 || h === 0) return;
  scene.resize(w, h);
  card.setPosition(
    Math.max(PAD, (w - CARD_W) / 2),
    Math.max(PAD, (h - card.height) / 2),
  );
  scene.markDirty();
}

new ResizeObserver(fit).observe(app);
scene.start();
