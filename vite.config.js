// vite.config.js
import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Pokemon-research/' : '/',
});
