import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup/vitest.setup.js'],
    include: ['tests/**/*.test.js'],
    globals: true
  }
});
