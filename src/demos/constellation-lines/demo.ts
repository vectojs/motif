import { Scene, Entity, SpatialHashGrid, type BatchCircle, type IRenderer } from '@vectojs/core';

// Constellation lines: N points drift and connect to nearby neighbors with a
// distance-faded line. The line pass is a genuine O(n) vs O(n²) neighbor
// query comparison — SpatialHashGrid.query() against a naive double loop —
// with the actual per-frame query cost measured and shown live, not
// asserted. Points render through Entity.getBatchCircle(), the fast path the
// Scene routes to its WebGL point layer (pointBackend: 'webgl') so the
// circle draw itself is never the bottleneck being measured.

// Measures the Scene's REAL render cadence, not the display's vsync rate.
// An independent requestAnimationFrame loop fires every vsync tick
// regardless of whether Scene actually rendered that tick — on a 240Hz
// display it samples ~240 ticks/sec even while Scene.loop()'s own maxFPS
// cap renders only every 4th one, so a naive HUD would read "240fps" while
// the visible motion was genuinely capped at 60. Entity.update(dt) is only
// ever called from inside Scene's renderNode() walk, which is skipped
// entirely on a throttled/skipped tick — so a probe entity's own update()
// calls are a direct measurement of frames Scene actually rendered.
class FrameProbe extends Entity {
  frameTimes: number[] = [];
  isPointInside() {
    return false;
  }
  render() {}
  update(dt: number) {
    this.frameTimes.push(dt);
    // A window this small (~330ms at 60fps) still smooths ordinary
    // frame-to-frame noise, but doesn't let the average lag behind a real
    // fps transition — a larger window held onto stale throttled-fps
    // samples for roughly a full second after Scene un-throttled following
    // interaction, making the HUD under-report for far longer than the
    // actual slowdown lasted.
    if (this.frameTimes.length > 20) this.frameTimes.shift();
  }
  avgFrameTime() {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
  }
}

const app = document.getElementById('app')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;

const INK = '#2a2723';
const CORAL = '#d97757';
// LINK_DIST=90 at up to 4000 points measured ~288 average neighbors/point —
// dense enough that SpatialHashGrid's per-point Map/Set hashing overhead
// exceeded the candidate-count savings, so brute-force actually won (a real,
// reproducible result — not a bug). SpatialHashGrid earns its keep on SPARSE
// neighbor fractions (the real-world case it's designed for: many total
// entities, few nearby each), so this is tuned down to keep average degree
// in the tens, not hundreds, even at the highest point-count tier.
const LINK_DIST = 46;
const SPEED = 26; // px/s

function hexToRGB(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const [LR, LG, LB] = hexToRGB(INK);

// One lightweight Entity per point. Deliberately minimal (x/y/velocity/
// radius only) — getBatchCircle() routes it through the Scene's fast path,
// which skips this entity's own render() entirely and goes straight to the
// WebGL point layer (or the CanvasRenderer batch when WebGL is unavailable).
class Point extends Entity {
  vx: number;
  vy: number;
  radius = 2.2;

  constructor(x: number, y: number, vx: number, vy: number) {
    super();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  // Points drift perpetually and never settle — without this override,
  // Scene has no way to know motion is in flight (the default
  // hasPendingAnimations() returns false), so its own idle-detection
  // considers the scene "idle" every frame and the renderMode:'always'
  // auto-throttle drops the WHOLE demo to ~2fps despite 1500 points
  // visibly moving. Measured before this fix: the HUD's own frame-time
  // readout showed ~400ms/frame (2fps) at rest — this was the actual
  // severe jank being reported, not a DPR or sandbox issue.
  override hasPendingAnimations() {
    return true;
  }

  override update(dt: number) {
    const step = Math.min(dt, 32) / 1000;
    let nx = this.x + this.vx * step;
    let ny = this.y + this.vy * step;
    const w = this.scene?.width ?? 0;
    const h = this.scene?.height ?? 0;
    if (nx < 0) nx += w;
    else if (nx > w) nx -= w;
    if (ny < 0) ny += h;
    else if (ny > h) ny -= h;
    this.x = nx;
    this.y = ny;
  }

  isPointInside() {
    return false;
  }

  render() {
    // Never called: getBatchCircle() below diverts this entity to the
    // Scene's point-batch fast path before render() would run.
  }

  override getBatchCircle(): BatchCircle {
    return { radius: this.radius, color: CORAL };
  }
}

// Draws the neighbor-link lines and owns the algorithm comparison. Grid mode
// rebuilds a SpatialHashGrid every frame and queries a small AABB per point;
// brute-force mode checks every pair. Both paths are timed with
// performance.now() around ONLY the search+path-building work (excluding
// point physics and the actual stroke() calls), so lastQueryMs is a clean
// measurement of the algorithm itself.
class LinkLines extends Entity {
  points: Point[];
  useGrid = true;
  lastQueryMs = 0;
  lastLineCount = 0;
  grid = new SpatialHashGrid(LINK_DIST);

  constructor(points: Point[]) {
    super('LinkLines');
    this.points = points;
  }

  isPointInside() {
    return false;
  }

  render(r: IRenderer) {
    const pts = this.points;
    const n = pts.length;
    const t0 = performance.now();

    // Quantize per-segment alpha into a few buckets so we can build ONE
    // path per bucket and call stroke() a handful of times regardless of
    // point count, instead of once per line segment.
    const BUCKETS = 4;
    const paths: number[][] = Array.from({ length: BUCKETS }, () => []);
    let lineCount = 0;

    const consider = (i: number, j: number) => {
      const a = pts[i];
      const b = pts[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= LINK_DIST || dist <= 0) return;
      const t = 1 - dist / LINK_DIST;
      const bucket = Math.min(BUCKETS - 1, Math.floor(t * BUCKETS));
      paths[bucket].push(a.x, a.y, b.x, b.y);
      lineCount++;
    };

    if (this.useGrid) {
      this.grid.clear();
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        this.grid.insert(String(i), p.x, p.y, 0, 0);
      }
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const hits = this.grid.query(
          p.x - LINK_DIST,
          p.y - LINK_DIST,
          LINK_DIST * 2,
          LINK_DIST * 2,
        );
        for (const idStr of hits) {
          const j = Number(idStr);
          if (j > i) consider(i, j);
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) consider(i, j);
      }
    }

    this.lastQueryMs = performance.now() - t0;
    this.lastLineCount = lineCount;

    for (let b = 0; b < BUCKETS; b++) {
      const segs = paths[b];
      if (segs.length === 0) continue;
      const alpha = (0.04 + (b / (BUCKETS - 1)) * 0.16).toFixed(3);
      r.beginPath();
      for (let k = 0; k < segs.length; k += 4) {
        r.moveTo(segs[k], segs[k + 1]);
        r.lineTo(segs[k + 2], segs[k + 3]);
      }
      r.stroke(`rgba(${LR}, ${LG}, ${LB}, ${alpha})`, 1);
    }
  }
}

const scene = new Scene(canvas, {
  // 'always' is Scene's default renderMode; points drift continuously.
  maxFPS: 60,
  disableWindowResize: true,
  // Capped at 1 CSS pixel per canvas pixel, not the display's native DPR.
  // Measured directly (HUD's own frame-time readout at settled state, DPR1
  // vs DPR2, same point count): at maxDPR:2, a common HiDPI laptop screen
  // pushed frame time from 16.7ms to 140ms (7fps) — the neighbor-link pass
  // draws thousands of thin, semi-transparent stroke segments every frame,
  // and that cost scales with backing-store pixel count same as any other
  // canvas draw call. maxDPR:1 recovered to ~19ms (52fps). The lines are
  // already thin/translucent, so the extra sharpness at native DPR bought
  // little visible improvement (confirmed with a side-by-side screenshot
  // at deviceScaleFactor:2) — not worth a >7x frame-time cost.
  maxDPR: 1,
  pointBackend: 'webgl', // routes Point.getBatchCircle() to the GPU layer
});

const frameProbe = new FrameProbe();
scene.add(frameProbe);

let points: Point[] = [];
let lines: LinkLines | null = null;

function spawnPoints(count: number) {
  for (const p of points) scene.remove(p);
  if (lines) scene.remove(lines);
  const w = app.clientWidth || 800;
  const h = app.clientHeight || 600;
  points = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    return new Point(
      Math.random() * w,
      Math.random() * h,
      Math.cos(angle) * SPEED,
      Math.sin(angle) * SPEED,
    );
  });
  lines = new LinkLines(points);
  // Lines first so points draw on top of them.
  scene.add(lines);
  for (const p of points) scene.add(p);
}

spawnPoints(1500);

// Tracks the canvas size fit() last saw, so a resize can rescale existing
// point positions proportionally instead of leaving them exactly where they
// were. scene.resize() only changes the canvas/backing-store dimensions —
// it does not touch entity positions — so shrinking the canvas pushes
// points outside the new bounds (Point.update()'s wrap-around then pulls
// them back in, but only one canvas-width at a time per frame) and growing
// back leaves every point still confined to whatever sub-region it had
// wrapped into at the smaller size, clustering them in one corner instead
// of spreading across the newly available area.
let lastW = 0;
let lastH = 0;

function fit() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (w === 0 || h === 0) return;
  scene.resize(w, h);
  if (lastW > 0 && lastH > 0 && (lastW !== w || lastH !== h)) {
    const sx = w / lastW;
    const sy = h / lastH;
    for (const p of points) {
      p.x *= sx;
      p.y *= sy;
    }
  }
  lastW = w;
  lastH = h;
}
const observer = new ResizeObserver(fit);
observer.observe(app);

scene.start();

// --- UI: point-count buttons + algorithm toggle ---
const countButtons: Record<string, number> = {
  'btn-count-low': 600,
  'btn-count-mid': 1500,
  'btn-count-high': 4000,
};
for (const [id, count] of Object.entries(countButtons)) {
  document.getElementById(id)!.addEventListener('click', () => {
    for (const other of Object.keys(countButtons)) {
      document.getElementById(other)!.setAttribute('aria-pressed', String(other === id));
    }
    spawnPoints(count);
  });
}

const algoBtn = document.getElementById('btn-algo')!;
algoBtn.addEventListener('click', () => {
  if (!lines) return;
  lines.useGrid = !lines.useGrid;
  algoBtn.textContent = lines.useGrid
    ? 'algo: grid (click for brute-force)'
    : 'algo: brute-force (click for grid)';
  algoBtn.setAttribute('aria-pressed', String(!lines.useGrid));
});

function updateHud() {
  const avg = frameProbe.avgFrameTime();
  if (avg > 0) {
    const fps = 1000 / avg;
    const queryMs = lines ? lines.lastQueryMs.toFixed(2) : '—';
    const lineCount = lines ? lines.lastLineCount : 0;
    hud.textContent =
      `${points.length} pts · ${lineCount} links\n` +
      `frame ${avg.toFixed(1)}ms · ${fps.toFixed(0)} fps\n` +
      `query ${queryMs}ms (${lines?.useGrid ? 'grid' : 'brute-force'})`;
  }
  setTimeout(updateHud, 250);
}
updateHud();
