import type { DemoMeta } from '../../registry/types';

export default {
  title: 'Particle Text',
  description:
    'Type any two words and Transform scatters the first into a particle cloud that reforms as the second — spring-to-origin physics (ComputeParticleEntity) holds each shape together. Adjustable particle count, transform duration, and a two-stop gradient (built from several color-tinted particle buckets). The real text stays reachable through Ctrl+F and screen readers the whole time via a separate, unselectable content-projection host.',
  category: 'effects',
  tags: ['particles', 'webgpu', 'content-projection'],
  packages: ['@vectojs/core'],
  order: 30,
} satisfies DemoMeta;
