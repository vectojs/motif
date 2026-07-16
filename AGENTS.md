# Motif Agent Guide 🤖

**Motif** is the VectoJS component & effect gallery — a Storybook × shadcn/ui × CodePen showcase where every VectoJS component, animation, and effect can be found, previewed live, and copied as a reference. Design spec + implementation plan live in `vectojs-docs/superpowers/{specs,plans}/2026-07-16-motif*`.

---

## 🌲 Architecture Map

Motif is a **hybrid**: an Astro DOM shell (nav, search, code panel, chrome) hosting **per-demo VectoJS canvas islands** rendered inside sandboxed iframes that load `@vectojs/*` live from esm.sh.

- **`src/demos/<id>/{demo.js, index.html}`**: one folder per demo. `demo.js` is **native JavaScript** (no transpile — the code shown is the code that runs). `index.html` hand-authors the importmap (pinned esm.sh URLs) + a `<canvas>` + `<script type="module" src="./demo.js">`, and inlines `no-ff-webgpu.js` before the module.
- **`src/registry.ts`**: the `Demo` type + `DEMOS` array — the single source of truth for the catalog. `moduleSource`/`htmlSource` are populated at build from the two files' raw text. `packages` is metadata only (filtering/display + version-lockstep input); it does NOT generate the importmap.
- **`src/pages/` + `src/components/`**: the Astro 3-pane shell (left nav, center preview stage, right read-only code panel) + top bar.
- **`public/no-ff-webgpu.js`**: UA-sniff shim that hides `navigator.gpu` on Firefox (Firefox WebGPU SIGSEGVs on some Linux/NVIDIA/Wayland). Must run before any demo module.

---

## 🛠️ Tooling & Standards

- **Package manager**: Bun (`bun install`, `bun run dev`, `bun run build`).
- **Formatter**: Prettier, strictly enforced. **Linter**: Oxlint (`oxlint --deny-warnings src`).
- **TypeScript**: strict. Demos themselves are `.js` (they run untranspiled in the browser); the Astro shell/tooling is `.ts`/`.astro`.
- **Gates**: `format:check`, `lint`, `check:registry` (every demo folder has an entry and vice-versa), `check:versions` (each demo's index.html importmap pins match the repo's declared `@vectojs/*` deps), `test`, `build`.

---

## ✍️ Adding a demo

1. Create `src/demos/<id>/demo.js` (native JS ES module importing from `@vectojs/core`/`@vectojs/ui`) and `src/demos/<id>/index.html` (importmap with pinned esm.sh URLs + `no-ff-webgpu.js` first + canvas + `<script type="module" src="./demo.js">`).
2. Add a `Demo` entry to `DEMOS` in `src/registry.ts` (id, title, description, category, tags, packages).
3. Default to the 2D/CPU point backend; only set `pointBackend: 'webgl'` if the demo needs it, and tag it so the smoke test covers it.
4. `bun run format:check && bun run lint && bun run check:registry && bun run check:versions && bun run test && bun run build` must all pass.

---

## 🚨 Guidelines for AI Agents

- **Never author `.ts` demos.** Demos are native JS so "code shown = code run" stays literally true.
- Keep new demos inside `src/demos/`. Don't modify bundler config or `.github/` workflows unless instructed.
- iframes are `sandbox="allow-scripts"` with **no** `allow-same-origin` — do not rely on same-origin access from a demo.
- Verify `bun run build` (0 errors) before completing.
