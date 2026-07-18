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

**Content policy (2026-07-18):** Motif exists for UI you _cannot_ get from the
official docs — tactile materials (liquid glass, ceramic, jelly), signature
animation, and special effects (glitch type, particles). Before adding a demo,
check `vectojs.org/reference` and the gallery's Creations: if a plain
component usage is already covered there, do **not** duplicate it here. New
demos join `materials` or `effects` unless there is a strong reason otherwise;
keep their canvases on the site's cream palette (`#f7f4ee` ground, coral
`#d97757` / peach `#f2b880` accents) so the catalog reads as one product.

1. Create `src/demos/<id>/demo.js` (native JS ES module importing from `@vectojs/core`/`@vectojs/ui`) and `src/demos/<id>/index.html` (importmap with pinned esm.sh URLs + `no-ff-webgpu.js` first + canvas + `<script type="module" src="./demo.js">`).
2. Create `src/demos/<id>/meta.ts` exporting a `default: DemoMeta` (`title`, `description`, `category`, `tags`, `packages`, `order`) — one file per demo, so adding a demo never touches a file another demo's PR is also touching. Run `bun run inline:sources` to regenerate `src/registry/generated-meta.ts` (committed, like `generated-sources.ts`) and pick it up in `DEMOS`. Categories and their nav order live in `src/registry/types.ts` (`CATEGORIES`); the landing page, left nav, checker, and tests all read from it.
3. Default to the 2D/CPU point backend; only set `pointBackend: 'webgl'` if the demo needs it, and tag it so the smoke test covers it. Add showcase-tier demos to the route list in `test/smoke.ts`.
4. **`Scene.add` takes ONE entity** — `scene.add(...list)` silently drops all but the first in plain JS (see forge/findings.md 2026-07-18). Loop instead.
5. Rich material surfaces (blur, radial gradients, composite masking, source-rect sampling) belong in offscreen canvases composed with raw Canvas2D; the entity then draws one `drawImage`. `IRenderer` stays the only thing touching the scene canvas.
6. `bun run format:check && bun run lint && bun run check:registry && bun run check:versions && bun run test && bun run build` must all pass.

---

## 🚨 Guidelines for AI Agents

- **Never author `.ts` demos.** Demos are native JS so "code shown = code run" stays literally true.
- Keep new demos inside `src/demos/`. Don't modify bundler config or `.github/` workflows unless instructed.
- Demo iframes are `sandbox="allow-scripts allow-same-origin"` (same-origin is required for module/importmap loading from the static route — see the comment in `CenterStage.astro`). First-party PR-reviewed demos only; user-editable code would need a separate origin.
- Verify `bun run build` (0 errors) before completing.
