// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Pokemon-research/',   // prod prefix (dev becomes '/')
  build: { outDir: 'dist', emptyOutDir: true }
});
