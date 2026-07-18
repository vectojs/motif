import type { DemoMeta } from "../../registry/types";

export default {
  title: "Jelly Buttons",
  description:
    "Wobbling gelatin blobs on a mass-spring rim — poke one and the whole surface ripples; hit-testing follows the deformed outline, not a box.",
  category: "materials",
  tags: ["spring", "squishy"],
  packages: ["@vectojs/core"],
  order: 30,
} satisfies DemoMeta;
