import type { Demo } from "./types";
import { GENERATED_SOURCES } from "./generated-sources";

export type { Demo, DemoCategory } from "./types";

type DemoMeta = Omit<Demo, "moduleSource" | "htmlSource">;

const ENTRIES: DemoMeta[] = [
  {
    id: "particle-button",
    title: "Particle Button",
    description:
      "A button that emits a GPU-simulated spark burst on click, with a transparent CPU fallback.",
    category: "effects",
    tags: ["GPU", "animation"],
    packages: ["@vectojs/core", "@vectojs/ui"],
  },
];

export const DEMOS: Demo[] = ENTRIES.map((e) => ({
  ...e,
  moduleSource: GENERATED_SOURCES[e.id]?.moduleSource ?? "",
  htmlSource: GENERATED_SOURCES[e.id]?.htmlSource ?? "",
}));
