interface Entry {
  id: string;
  title: string;
  tags: string[];
  category: string;
  href: string;
}

let entries: Entry[] = [];
let loaded = false;

async function ensureIndex(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    entries = await (await fetch("/search-index.json")).json();
  } catch {
    entries = [];
  }
}

function score(entry: Entry, q: string): number {
  const hay =
    `${entry.title} ${entry.tags.join(" ")} ${entry.category}`.toLowerCase();
  if (!q) return 1;
  if (hay.includes(q)) return 2;
  let i = 0;
  for (const ch of hay) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

function buildModal(): {
  overlay: HTMLElement;
  input: HTMLInputElement;
  list: HTMLElement;
} {
  const overlay = document.createElement("div");
  overlay.className = "search-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search components and effects">
      <input class="search-input" type="text" placeholder="Search components & effects…" aria-label="Search query" autocomplete="off" spellcheck="false" />
      <ul class="search-results" role="listbox"></ul>
    </div>`;
  document.body.appendChild(overlay);
  return {
    overlay,
    input: overlay.querySelector("input")!,
    list: overlay.querySelector(".search-results")!,
  };
}

function initSearch(): void {
  const triggerEl = document.querySelector<HTMLButtonElement>(
    "[data-search-trigger]",
  );
  if (!triggerEl) return;
  const trigger: HTMLButtonElement = triggerEl;
  const { overlay, input, list } = buildModal();
  let results: Entry[] = [];
  let active = 0;

  function render(): void {
    list.innerHTML = "";
    if (results.length === 0 && input.value.trim() !== "") {
      const li = document.createElement("li");
      li.className = "search-empty";
      li.textContent = `No components or effects match “${input.value.trim()}”.`;
      list.appendChild(li);
      return;
    }
    results.forEach((e, i) => {
      const li = document.createElement("li");
      li.className = "search-result" + (i === active ? " active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === active));
      li.innerHTML = `<span class="sr-title">${e.title}</span><span class="sr-cat">${e.category}</span>`;
      li.addEventListener("click", () => (location.href = e.href));
      list.appendChild(li);
    });
  }

  function search(): void {
    const q = input.value.trim().toLowerCase();
    results = entries
      .map((e) => ({ e, s: score(e, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.e);
    active = 0;
    render();
  }

  async function open(): Promise<void> {
    await ensureIndex();
    overlay.hidden = false;
    input.value = "";
    search();
    input.focus();
  }
  function close(): void {
    overlay.hidden = true;
    trigger.focus();
  }

  trigger.addEventListener("click", open);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  input.addEventListener("input", search);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(active + 1, results.length - 1);
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) location.href = results[active].href;
    } else if (e.key === "Escape") {
      close();
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (overlay.hidden) void open();
      else close();
    }
  });
}

initSearch();
