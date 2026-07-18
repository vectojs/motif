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
];

export const DEMOS: Demo[] = ENTRIES.map((e) => ({
  ...e,
  moduleSource: GENERATED_SOURCES[e.id]?.moduleSource ?? "",
  htmlSource: GENERATED_SOURCES[e.id]?.htmlSource ?? "",
}));
