import type { DemoMeta } from "../../registry/types";

export default {
  title: "Mercury Blobs",
  description:
    "Draggable silvery blobs that merge into one liquid surface when close and split apart when pulled away — a classic blur + contrast-ramp 'goo' composite, with the drag hit-testing following each blob's own circle regardless of how merged it currently looks.",
  category: "materials",
  tags: ["goo", "metaball", "drag"],
  packages: ["@vectojs/core"],
  order: 40,
} satisfies DemoMeta;
