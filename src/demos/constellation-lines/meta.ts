import type { DemoMeta } from "../../registry/types";

export default {
  title: "Constellation Lines",
  description:
    "Drifting points connect to nearby neighbors with distance-faded links — a live, switchable comparison of SpatialHashGrid neighbor queries against a naive O(n²) search, with real measured query time on screen.",
  category: "effects",
  tags: ["particles", "spatial-index", "webgl"],
  packages: ["@vectojs/core"],
  order: 20,
} satisfies DemoMeta;
