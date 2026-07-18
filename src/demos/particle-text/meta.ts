import type { DemoMeta } from "../../registry/types";

export default {
  title: "Particle Text",
  description:
    "A word rasterized once into a particle-cloud shape — spring-to-origin physics (ComputeParticleEntity) holds it together, and a click scatters it into the next word. The real text stays reachable through Ctrl+F and screen readers the whole time via a separate content-projection host.",
  category: "effects",
  tags: ["particles", "webgpu", "content-projection"],
  packages: ["@vectojs/core"],
  order: 30,
} satisfies DemoMeta;
