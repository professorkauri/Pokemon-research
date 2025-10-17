import { defineConfig } from 'vite';

export default defineConfig({
  // IMPORTANT: replace with your actual repo name
  base: process.env.GITHUB_ACTIONS ? '/-pokemon-research/' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
