import type { Demo } from "./types";
import { GENERATED_SOURCES } from "./generated-sources";

export type { Demo, DemoCategory } from "./types";

type DemoMeta = Omit<Demo, "moduleSource" | "htmlSource">;

const ENTRIES: DemoMeta[] = [
  {
    id: "controls-form",
    title: "Settings Form",
    description:
      "A canvas-native form — Input, Slider, Toggle, and Button in a Stack — repainting on demand, never per frame.",
    category: "controls",
    tags: ["form", "onDemand"],
    packages: ["@vectojs/core", "@vectojs/ui"],
  },
  {
    id: "virtual-list",
    title: "Virtual List",
    description:
      "A 5,000-row list that mounts only the visible window plus overscan — smooth momentum scroll inside a canvas card.",
    category: "layout",
    tags: ["virtualization", "scroll"],
    packages: ["@vectojs/core", "@vectojs/ui"],
  },
  {
    id: "particle-button",
    title: "Particle Button",
    description:
      "A button that emits a GPU-simulated spark burst on click, with a transparent CPU fallback.",
    category: "effects",
    tags: ["GPU", "animation"],
    packages: ["@vectojs/core", "@vectojs/ui"],
  },
  {
    id: "three-panel",
    title: "3D Panel",
    description:
      "A live VectoJS UI mapped onto a Three.js plane — orbit the camera, and raycast pointer events drive the canvas controls in 3D.",
    category: "3d-xr",
    tags: ["Three.js", "WebGL", "raycast"],
    packages: ["@vectojs/core", "@vectojs/ui", "@vectojs/three"],
  },
];

export const DEMOS: Demo[] = ENTRIES.map((e) => ({
  ...e,
  moduleSource: GENERATED_SOURCES[e.id]?.moduleSource ?? "",
  htmlSource: GENERATED_SOURCES[e.id]?.htmlSource ?? "",
}));
