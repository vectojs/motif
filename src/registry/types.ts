export type DemoCategory = "controls" | "layout" | "effects" | "3d-xr";

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
