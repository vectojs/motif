# Motif Agent Guide 🤖

**Motif** is the VectoJS component & effect gallery — a Storybook × shadcn/ui × CodePen showcase where every VectoJS component, animation, and effect can be found, previewed live, and copied as a reference.

---

## 🌲 Architecture Map

Motif is a **hybrid**: an Astro DOM shell (nav, search, code panel, chrome) hosting **per-demo VectoJS canvas islands** rendered inside sandboxed iframes that load `@vectojs/*` live from esm.sh.

- **`src/demos/<id>/{demo.ts, index.html}`**: one folder per demo. `demo.ts` is authored TypeScript, typechecked like everything else in the repo; `scripts/inline-sources.ts` compiles it (via `tsc --removeComments false`, per-file, comments preserved) into `public/demos/<id>/demo.js`, which is what actually ships. **Code shown ≠ code run here**: the read-only code panel displays the authored `.ts` (the better reference), while the served file is its compiled output — see the `AI Agents` section below. `index.html` hand-authors the importmap (pinned esm.sh URLs) + a `<canvas>` + `<script type="module" src="./demo.js">`, and inlines `no-ff-webgpu.js` before the module; it is copied verbatim since `./demo.js` is already the served filename.
- **`src/registry.ts`**: the `Demo` type + `DEMOS` array — the single source of truth for the catalog. `moduleSource`/`htmlSource` are populated at build from the two files' raw text. `packages` is metadata only (filtering/display + version-lockstep input); it does NOT generate the importmap.
- **`src/pages/` + `src/components/`**: the Astro 3-pane shell (left nav, center preview stage, right read-only code panel) + top bar.
- **`public/no-ff-webgpu.js`**: UA-sniff shim that hides `navigator.gpu` on Firefox (Firefox WebGPU SIGSEGVs on some Linux/NVIDIA/Wayland). Must run before any demo module.

---

## 🛠️ Tooling & Standards

- **Package manager**: Bun (`bun install`, `bun run dev`, `bun run build`).
- **Formatter**: **oxfmt**, strictly enforced (`bunx oxfmt --write <files>`, gated by `format:check`). Prettier is **not** the formatter here and is not a declared dependency — it only resolves transitively via `prettier-plugin-astro`, which is why `scripts/inline-sources.ts` calling `prettier --write` silently left the generated registry failing `format:check`. **Linter**: Oxlint (`oxlint --deny-warnings src`).
- **TypeScript**: strict, everywhere, including `src/demos/` — it was excluded from typechecking from the repo's scaffold commit onward, and that gap is exactly how the `renderMode`/`globalAlpha` bugs below survived. `bunx tsc --noEmit -p tsconfig.json` typechecks the whole repo, demos included; `astro check` covers the `.astro` shell.
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

1. Create `src/demos/<id>/demo.ts` (TypeScript ES module importing from `@vectojs/core`/`@vectojs/ui`, typechecked — no `any` escape hatches beyond what `Entity.render(renderer: any)`'s own signature forces) and `src/demos/<id>/index.html` (importmap with pinned esm.sh URLs + `no-ff-webgpu.js` first + canvas + `<script type="module" src="./demo.js">` — note `.js`: that's the compiled file `inline:sources` produces, not what you authored). Run `bun run inline:sources` to compile it into `public/demos/<id>/`.
2. Create `src/demos/<id>/meta.ts` exporting a `default: DemoMeta` (`title`, `description`, `category`, `tags`, `packages`, `order`) — one file per demo, so adding a demo never touches a file another demo's PR is also touching. Run `bun run inline:sources` to regenerate `src/registry/generated-meta.ts` (committed, like `generated-sources.ts`) and pick it up in `DEMOS`. Categories and their nav order live in `src/registry/types.ts` (`CATEGORIES`); the landing page, left nav, checker, and tests all read from it.
3. Default to the 2D/CPU point backend; only set `pointBackend: 'webgl'` if the demo needs it, and tag it so the smoke test covers it. Add showcase-tier demos to the route list in `test/smoke.ts`.
4. **`Scene.add` takes ONE entity** — `scene.add(...list)` silently drops all but the first in plain JS (see forge/findings.md 2026-07-18). Loop instead.
5. **`renderMode` IS a real `SceneOptions` key since `@vectojs/core@1.26.0`** — `new Scene(canvas, { renderMode: 'onDemand' })` now applies before the first frame. Before 1.26.0 it was a field with no matching option, silently ignored, so the scene stayed `'always'` and idled at core's 2fps auto-throttle instead of 0 — measured in Chrome 150 on 2026-08-01, all four `onDemand` demos painting a steady 2.00Hz forever. The class of mistake generalizes: `@vectojs/core@1.27.0` added a dev-mode warning for ANY unrecognized `SceneOptions` key or property-shaped write to a renderer (`r.globalAlpha = x` instead of `r.setGlobalAlpha(x)`) — but that warning only fires at runtime, in a browser, with `Scene.devMode` set. Full TypeScript coverage on `src/demos/` (see above) is what actually catches these at author time.
6. Rich material surfaces (blur, radial gradients, composite masking, source-rect sampling) belong in offscreen canvases composed with raw Canvas2D; the entity then draws one `drawImage`. `IRenderer` stays the only thing touching the scene canvas.
7. `bun run check && bun run check:registry && bun run check:versions && bun test && bun run build` must all pass. (`check` runs `format:check`, `lint` and `lint:md`.) For anything touching `renderMode`, `markDirty`, or an `update()` loop, also run `bun run test:smoke` — it drives real Chrome against esm.sh and is the only gate that catches a demo that loads but never paints.

---

## 🚨 Guidelines for AI Agents

- **Always author `.ts` demos** (reversed 2026-08-01 — an earlier version of this guide said the opposite). "Code shown = code run" is no longer literal: **code shown = code authored (`.ts`, the better reference); code served = its compiled output (`.js`)**. Never hand-edit `public/demos/` — it's gitignored and rebuilt from `src/demos/` by `bun run inline:sources` on every run. Never author `demo.js` directly.
- Keep new demos inside `src/demos/`. Don't modify bundler config or `.github/` workflows unless instructed.
- Demo iframes are `sandbox="allow-scripts allow-same-origin"` (same-origin is required for module/importmap loading from the static route — see the comment in `CenterStage.astro`). First-party PR-reviewed demos only; user-editable code would need a separate origin.
- Verify `bun run build` (0 errors) before completing.
