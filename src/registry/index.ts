import type { Demo } from "./types";

export type { Demo, DemoCategory } from "./types";

export const DEMOS: Demo[] = [
  {
    id: "particle-button",
    title: "Particle Button",
    description:
      "A button that emits a GPU-simulated spark burst on click, with a transparent CPU fallback.",
    category: "effects",
    tags: ["GPU", "animation"],
    packages: ["@vectojs/core"],
    moduleSource: "",
    htmlSource: "",
  },
];
