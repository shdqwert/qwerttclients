import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Фронтенд лежит в web/, сборка — в dist/. В разработке запросы /api проксируются на сервер.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5180,
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORT ?? 4000}`, changeOrigin: false } },
  },
});
