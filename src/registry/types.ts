// Nav/display order. Motif's focus is UI you cannot get from the docs
// reference — tactile surfaces and special effects. Basic components
// (forms, virtual lists, context menus, 3D panels, particle buttons) are
// covered by the docs reference and the Gallery's Creation section instead —
// see AGENTS.md's content policy.
export const CATEGORIES = [
  { category: 'materials', label: 'Materials' },
  { category: 'effects', label: 'Effects' },
] as const;

export type DemoCategory = (typeof CATEGORIES)[number]['category'];

/**
 * Authored per-demo metadata — lives at `src/demos/<id>/meta.ts` (the `id`
 * itself is the folder name, not repeated here). One file per demo means
 * adding a demo never touches a file another demo's PR is also touching, so
 * two agents adding demos in parallel cannot merge-conflict on this data.
 */
export interface DemoMeta {
  title: string;
  description: string;
  category: DemoCategory;
  tags: string[];
  // Metadata only: which @vectojs/* packages the demo uses, for filtering,
  // display, and the version-lockstep check. It does NOT generate the
  // importmap — each demo's authored index.html owns that (see registry docs).
  packages: string[];
  // Manual display-order tiebreaker within a category (ascending). Demos
  // sharing a value fall back to alphabetical id order.
  order: number;
}

export interface Demo extends DemoMeta {
  id: string;
  // Populated by the build inliner from the demo's authored files; empty at
  // authoring time.
  moduleSource: string;
  htmlSource: string;
}
