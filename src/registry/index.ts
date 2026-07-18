import type { Demo } from "./types";
import { GENERATED_SOURCES } from "./generated-sources";

export type { Demo, DemoCategory } from "./types";
export { CATEGORIES } from "./types";

type DemoMeta = Omit<Demo, "moduleSource" | "htmlSource">;

const ENTRIES: DemoMeta[] = [
  {
    id: "liquid-glass",
    title: "Liquid Glass",
    description:
      "A draggable frosted-glass card that refracts a drifting color field behind it — live backdrop sampling, edge bending, and a spring-lagged grab.",
    category: "materials",
    tags: ["glass", "refraction"],
    packages: ["@vectojs/core"],
  },
  {
    id: "ceramic",
    title: "Ceramic Keys",
    description:
      "Glazed-clay keycaps and a kiln-fired toggle — speckled glaze, soft studio shadows, and a spring press that physically depresses each key.",
    category: "materials",
    tags: ["clay", "tactile"],
    packages: ["@vectojs/core"],
  },
  {
    id: "jelly",
    title: "Jelly Buttons",
    description:
      "Wobbling gelatin blobs on a mass-spring rim — poke one and the whole surface ripples; hit-testing follows the deformed outline, not a box.",
    category: "materials",
    tags: ["spring", "squishy"],
    packages: ["@vectojs/core"],
  },
  {
    id: "glitch-text",
    title: "Glitch Text",
    description:
      "Headline type that tears into misregistered print plates — coral/teal channel splits, sliced scanbands, and dropout blocks in timed bursts.",
    category: "effects",
    tags: ["type", "distortion"],
    packages: ["@vectojs/core"],
  },
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
    id: "context-menu",
    title: "Context Menu",
    description:
      "A right-click file grid — separators, disabled rows, and a nested Sort-by submenu, with the browser's own menu suppressed.",
    category: "controls",
    tags: ["overlay", "a11y"],
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
