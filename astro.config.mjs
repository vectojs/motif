import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://motif.vectojs.org",
  trailingSlash: "always",
  integrations: [sitemap()],
});
