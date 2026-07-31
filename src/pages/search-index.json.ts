import type { APIRoute } from 'astro';
import { DEMOS } from '../registry';

const index = DEMOS.map((d) => ({
  id: d.id,
  title: d.title,
  tags: d.tags,
  category: d.category,
  href: `/${d.category}/${d.id}/`,
}));

export const GET: APIRoute = () =>
  new Response(JSON.stringify(index), {
    headers: { 'content-type': 'application/json' },
  });
