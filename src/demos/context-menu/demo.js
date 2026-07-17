import { Scene, Rect } from "@vectojs/core";
import { Flow, Text, Card, ContextMenu } from "@vectojs/ui";

const app = document.querySelector("#app");
const canvas = document.querySelector("#canvas");

// Static, click-driven UI: repaint only when a menu opens/closes/selects, never
// per frame. Same onDemand contract as the Settings Form demo — the engine
// idles at ~0 CPU while the menu sits open, since ContextMenu's own open/close
// spring animates through the transition system (markDirty per frame it's
// still moving), not a manual render loop.
// disableWindowResize: a ResizeObserver on #app drives sizing (the VectoJS
// idiom for an embedded scene) so the demo tracks its iframe container, not
// the top window — see fit() below.
const scene = new Scene(canvas, { disableWindowResize: true });
scene.renderMode = "onDemand";

// The browser's own right-click menu would otherwise appear ON TOP of ours —
// suppress it globally. This has to be a real DOM listener because "right
// click" isn't a VectoEvent the engine dispatches; entities only ever see
// pointerdown/up (see below), which fires in parallel with the browser's
// native contextmenu event, not instead of it.
window.addEventListener("contextmenu", (e) => e.preventDefault());

const PAD = 20;
const CARD_W = 148;
const CARD_H = 108;

const FILES = [
  { name: "Design Notes.md", icon: "📝", color: "#e0a458" },
  { name: "Budget.xlsx", icon: "📊", color: "#3ba55d" },
  { name: "hero-shot.png", icon: "🖼️", color: "#7c5cff" },
  { name: "roadmap.pdf", icon: "📄", color: "#e05252" },
  { name: "invoice-04.csv", icon: "📈", color: "#22d3ee" },
  { name: "archive.zip", icon: "🗜️", color: "#9aa3b0" },
];

// One shared clipboard slot: which file (if any) was last "Copy"'d. Feeds the
// background menu's "Paste" disabled state below.
let clipboard = null;

// A full-bleed invisible hit target for "right-click empty space." `Scene`
// dispatches no pointer events of its own (only entities with an a11y shadow
// node do — see `card.on('pointerdown', ...)` below), so an entity has to own
// the background click. Added BEFORE the grid so tree order puts it
// underneath every card (later siblings are hit-tested first / drawn on
// top); resized alongside the canvas in fit().
const backgroundHit = new Card({
  width: 1,
  height: 1,
  bg: "transparent",
  label: "File browser background",
});
backgroundHit.interactive = true;
scene.add(backgroundHit);
backgroundHit.on("pointerdown", (e) => {
  const native = e.nativeEvent;
  if (native?.button !== 2) return;
  if (e.sceneX === undefined || e.sceneY === undefined) return;
  // Rebuilt fresh each time so its "Paste" row's disabled state reflects the
  // live clipboard var. Pass `backgroundHit` as the third arg so the fresh
  // instance resolves the scene on its first showAtPoint call (see the
  // per-file menu note above).
  buildBackgroundMenu().showAtPoint(e.sceneX, e.sceneY, backgroundHit);
});

const grid = new Flow({ gap: 16, maxWidth: 3 * (CARD_W + 16) - 16 });
grid.setPosition(PAD, PAD);
scene.add(grid);

let toastTimer = null;
const toast = new Text("", {
  font: "13px Inter, sans-serif",
  color: "#f4f6f8",
});
toast.opacity = 0;
scene.add(toast);

function flashToast(message) {
  toast.setText(message);
  toast.opacity = 1;
  scene.markDirty();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.opacity = 0;
    scene.markDirty();
  }, 1400);
}

function buildFileMenu(file) {
  return new ContextMenu({
    width: 200,
    items: [
      { label: "Open", icon: "⏵", shortcut: "Enter" },
      { label: "Rename", icon: "✎", shortcut: "F2" },
      { separator: true },
      {
        label: "Cut",
        icon: "✂",
        shortcut: "Ctrl+X",
        onClick: () => flashToast(`Cut "${file.name}"`),
      },
      {
        label: "Copy",
        icon: "⧉",
        shortcut: "Ctrl+C",
        onClick: () => {
          clipboard = file;
          flashToast(`Copied "${file.name}"`);
        },
      },
      { separator: true },
      {
        label: "Sort by",
        icon: "↕",
        children: [
          { label: "Name", onClick: () => sortFiles("name") },
          { label: "Type", onClick: () => sortFiles("type") },
          { label: "Date modified", disabled: true },
        ],
      },
      { separator: true },
      {
        label: "Delete",
        icon: "🗑",
        shortcut: "Del",
        // Every demo file is "protected" here on purpose: it demonstrates the
        // disabled-row rendering (greyed label, no hover state, no onClick)
        // without needing per-card removal state to make the point.
        disabled: true,
      },
    ],
  });
}

function buildBackgroundMenu() {
  return new ContextMenu({
    width: 190,
    items: [
      {
        label: "Paste",
        icon: "📋",
        shortcut: "Ctrl+V",
        disabled: !clipboard,
        onClick: clipboard
          ? () => flashToast(`Pasted "${clipboard.name}"`)
          : undefined,
      },
      { separator: true },
      {
        label: "Sort by",
        icon: "↕",
        children: [
          { label: "Name", onClick: () => sortFiles("name") },
          { label: "Type", onClick: () => sortFiles("type") },
          { label: "Date modified", disabled: true },
        ],
      },
      { separator: true },
      { label: "New Folder", icon: "📁", shortcut: "Ctrl+Shift+N" },
    ],
  });
}

function sortFiles(by) {
  const sorted = [...FILES].sort((a, b) =>
    by === "name"
      ? a.name.localeCompare(b.name)
      : a.name.split(".").pop().localeCompare(b.name.split(".").pop()),
  );
  FILES.length = 0;
  FILES.push(...sorted);
  renderCards();
  flashToast(`Sorted by ${by}`);
}

function renderCards() {
  for (const child of grid.children.slice()) grid.remove(child);

  for (const file of FILES) {
    const card = new Card({
      width: CARD_W,
      height: CARD_H,
      bg: "#14171f",
      border: "#1b1f29",
      radius: 12,
      label: file.name,
    });

    const swatch = new Rect({
      width: CARD_W - 24,
      height: 44,
      radius: 8,
      fill: file.color,
    });
    swatch.opacity = 0.18;
    swatch.setPosition(12, 14);
    card.add(swatch);

    const icon = new Text(file.icon, { font: "22px sans-serif" });
    icon.setPosition(20, 20);
    card.add(icon);

    const label = new Text(file.name, {
      font: "12.5px Inter, sans-serif",
      color: "#e2e8f0",
      maxWidth: CARD_W - 24,
      lineHeight: 16,
    });
    label.setPosition(12, 68);
    card.add(label);

    const menu = buildFileMenu(file);

    // Right-click isn't a VectoEvent (only pointerdown/up are dispatched into
    // the tree — see the window-level contextmenu suppression above). Filter
    // pointerdown down to the native right button (2), same pattern as the
    // ContextMenu class's own JSDoc example. Pass `card` as the third arg so
    // `showAtPoint` can resolve the scene even on the very first call (before
    // any manual `scene.add(menu)` — Overlay has no parent yet, so its
    // `.scene` walks to null without a source; @vectojs/ui@1.10.0 added this
    // arg exactly to fix that silent no-op).
    card.on("pointerdown", (e) => {
      const native = e.nativeEvent;
      if (native?.button !== 2) return;
      if (e.sceneX === undefined || e.sceneY === undefined) return;
      menu.showAtPoint(e.sceneX, e.sceneY, card);
    });

    grid.add(card);
  }

  toast.setPosition(PAD, grid.height + PAD + 24);
  scene.markDirty();
}

renderCards();

function fit() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w === 0 || h === 0) return;
  scene.resize(w, h);
  backgroundHit.width = w;
  backgroundHit.height = h;
  scene.markDirty();
}

new ResizeObserver(fit).observe(app);
scene.start();
