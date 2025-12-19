import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Serve the built app from the GitHub Pages docs/ subdirectory
  base: '/pricingmodel/docs/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true
  }
});
