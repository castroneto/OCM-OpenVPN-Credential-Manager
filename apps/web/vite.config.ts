import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web client talks to the API at `/api`. In dev we proxy to the local
// NestJS server; in production both are served behind the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.OCM_API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
