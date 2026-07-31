/**
 * Desktop shell chrome: drag-resize the left nav / right code panel, collapse
 * either one (or both, for a fullscreen center stage), and remember the
 * user's layout in localStorage. Mirrors the existing nav-toggle drawer
 * pattern (a plain DOM script, self-initializing on import) rather than
 * introducing a framework — Motif's shell has none.
 *
 * Panel widths live as CSS custom properties on #shell (--nav-w / --code-w);
 * collapsed/fullscreen states live as data-* attributes, matched by
 * motif.css. Only desktop widths (> 1180px, where the two side panels are
 * real grid columns rather than a stacked/drawer layout) persist a resize —
 * see the width guard in onPointerMove.
 */

const MIN_NAV_W = 180;
const MAX_NAV_W = 420;
const MIN_CODE_W = 280;
const MAX_CODE_W = 720;
const STORAGE_KEY = 'motif:shell-layout';

interface StoredLayout {
  navW?: number;
  codeW?: number;
  navCollapsed?: boolean;
  codeCollapsed?: boolean;
}

function loadStored(): StoredLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredLayout) : {};
  } catch {
    return {};
  }
}

function saveStored(patch: StoredLayout): void {
  try {
    const current = loadStored();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    /* localStorage unavailable (private mode / quota) — layout just won't persist */
  }
}

function initShellLayout(): void {
  const shell = document.getElementById('shell');
  if (!shell) return; // landing page has no shell

  const navToggle = document.querySelector<HTMLButtonElement>('[data-toggle-nav]');
  const codeToggle = document.querySelector<HTMLButtonElement>('[data-toggle-code]');
  const fullscreenToggles = document.querySelectorAll<HTMLButtonElement>(
    '[data-toggle-fullscreen]',
  );

  const stored = loadStored();
  let navCollapsed = stored.navCollapsed ?? false;
  let codeCollapsed = stored.codeCollapsed ?? true; // hidden by default
  let fullscreen = false;

  function applyWidths(navW: number, codeW: number): void {
    shell!.style.setProperty('--nav-w', `${navW}px`);
    shell!.style.setProperty('--code-w', `${codeW}px`);
  }
  applyWidths(stored.navW ?? 248, stored.codeW ?? 420);

  function applyCollapsedState(): void {
    shell!.setAttribute('data-nav-collapsed', String(navCollapsed));
    shell!.setAttribute('data-code-collapsed', String(codeCollapsed));
    navToggle?.setAttribute('aria-pressed', String(!navCollapsed));
    codeToggle?.setAttribute('aria-pressed', String(!codeCollapsed));
  }
  applyCollapsedState();

  navToggle?.addEventListener('click', () => {
    navCollapsed = !navCollapsed;
    applyCollapsedState();
    saveStored({ navCollapsed });
  });
  codeToggle?.addEventListener('click', () => {
    codeCollapsed = !codeCollapsed;
    applyCollapsedState();
    saveStored({ codeCollapsed });
  });

  function setFullscreen(next: boolean): void {
    fullscreen = next;
    shell!.setAttribute('data-stage-fullscreen', String(fullscreen));
    for (const btn of fullscreenToggles) btn.setAttribute('aria-pressed', String(fullscreen));
  }
  for (const btn of fullscreenToggles) {
    btn.addEventListener('click', () => setFullscreen(!fullscreen));
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fullscreen) setFullscreen(false);
  });

  // --- Drag-to-resize ---
  function wireHandle(
    handle: HTMLElement | null,
    getWidth: () => number,
    apply: (w: number) => void,
    min: number,
    max: number,
    sign: 1 | -1,
    onCommit: (w: number) => void,
  ): void {
    if (!handle) return;
    let dragging = false;
    let startX = 0;
    let startW = 0;

    function onMove(e: PointerEvent): void {
      if (!dragging) return;
      const delta = (e.clientX - startX) * sign;
      const next = Math.min(max, Math.max(min, startW + delta));
      apply(next);
    }
    function onUp(e: PointerEvent): void {
      if (!dragging) return;
      dragging = false;
      handle!.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      onCommit(getWidth());
      void e;
    }
    handle.addEventListener('pointerdown', (e) => {
      // Below the desktop breakpoint the handles are display:none and thus
      // unreachable, but guard anyway in case of a resize mid-drag.
      if (window.innerWidth <= 1180) return;
      dragging = true;
      startX = e.clientX;
      startW = getWidth();
      handle.classList.add('dragging');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      e.preventDefault();
    });
  }

  const navHandle = document.querySelector<HTMLElement>('[data-resize="nav"]');
  const codeHandle = document.querySelector<HTMLElement>('[data-resize="code"]');

  wireHandle(
    navHandle,
    () => parseFloat(getComputedStyle(shell!).getPropertyValue('--nav-w')),
    (w) => applyWidths(w, parseFloat(getComputedStyle(shell!).getPropertyValue('--code-w'))),
    MIN_NAV_W,
    MAX_NAV_W,
    1,
    (navW) => saveStored({ navW }),
  );
  wireHandle(
    codeHandle,
    () => parseFloat(getComputedStyle(shell!).getPropertyValue('--code-w')),
    (w) => applyWidths(parseFloat(getComputedStyle(shell!).getPropertyValue('--nav-w')), w),
    MIN_CODE_W,
    MAX_CODE_W,
    -1, // dragging the code handle left GROWS the panel (it sits on its left edge)
    (codeW) => saveStored({ codeW }),
  );
}

initShellLayout();
