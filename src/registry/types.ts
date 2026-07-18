// Nav/display order. Materials and effects lead: Motif's focus is UI you
// cannot get from the docs reference — tactile surfaces and special effects.
export const CATEGORIES = [
  { category: "materials", label: "Materials" },
  { category: "effects", label: "Effects" },
  { category: "3d-xr", label: "3D · XR" },
  { category: "controls", label: "Controls" },
  { category: "layout", label: "Layout" },
] as const;

export type DemoCategory = (typeof CATEGORIES)[number]["category"];

export interface Demo {
  id: string;
  title: string;
  description: string;
  category: DemoCategory;
  tags: string[];
  // Metadata only: which @vectojs/* packages the demo uses, for filtering,
  // display, and the version-lockstep check. It does NOT generate the
  // importmap — each demo's authored index.html owns that (see registry docs).
  packages: string[];
  // Populated by the build inliner (Task 3) from the demo's authored files;
  // empty at authoring time.
  moduleSource: string;
  htmlSource: string;
}
