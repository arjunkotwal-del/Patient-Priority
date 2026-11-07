import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    // API runs separately in dev (see `npm run dev`)
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  preview: { port: 3000, strictPort: true },
});
