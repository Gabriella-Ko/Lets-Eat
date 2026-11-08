import { defineConfig } from 'vite';

// Content lives outside game/ (content/, scripts/rules.json), so let Vite read the repo root.
export default defineConfig({
  base: './',
  server: { fs: { allow: ['..'] } },
  build: { chunkSizeWarningLimit: 2000, target: 'es2022' }, // es2022: main.js awaits the font
});
