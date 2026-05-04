import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 6002,
    host: '0.0.0.0',
    allowedHosts: ['orion.vortan.io'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:7001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
