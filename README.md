# Motif

The VectoJS component & effect gallery — a live, copy-ready reference for every
VectoJS component, animation, and effect (Storybook × shadcn/ui × CodePen).

Pick a component or effect, watch it run live in a real VectoJS canvas, read the
exact code that produced it, and copy it into your own project.

## Develop

```bash
bun install
bun run dev        # astro dev server
bun run build      # production build
bun run preview    # preview the build
```

## Gates

```bash
bun run format:check   # prettier
bun run lint           # oxlint
bun run check:registry # every demo folder has a registry entry and vice-versa
bun run check:versions # each demo's importmap pins match declared @vectojs/* deps
bun run test           # bun unit tests
```

## Adding a demo

Motif's focus is UI you can't get from the docs reference: tactile materials
(liquid glass, ceramic, jelly), signature animation, and special effects. If a
plain component usage is already covered by `vectojs.org/reference` or the
community gallery, it does not belong here.

Each demo is a folder under `src/demos/<id>/`:

- `demo.js` — a **native JavaScript** ES module (no transpile: the code shown in
  the gallery is exactly the code that runs). Imports `@vectojs/*` from the
  importmap.
- `index.html` — hand-authored: loads `/no-ff-webgpu.js` first, declares an
  importmap with pinned esm.sh URLs, a `<canvas>`, then
  `<script type="module" src="./demo.js">`.

Then add a `Demo` entry to `DEMOS` in `src/registry/index.ts`. Default to the 2D/CPU
point backend; only opt into `pointBackend: 'webgl'` when a demo needs it.

See `AGENTS.md` for the full architecture and constraints.
