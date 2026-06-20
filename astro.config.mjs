// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://daredevil587.github.io',
  base: '/web-document-tools',
  output: 'static',
  integrations: [
    react(),
    sitemap(),
  ],
  vite: {
    optimizeDeps: {
      // pdfjs-dist must NOT be pre-bundled (it has a dynamic worker import)
      exclude: ['pdfjs-dist'],
      include: ['pdf-lib'],
    },
    build: {
      rollupOptions: {
        // Keep pdfjs-dist external so it loads lazily at runtime
        external: [],
      },
    },
  },
});
