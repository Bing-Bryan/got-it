import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {resolve} from 'node:path';

export default defineConfig({
  root: resolve(process.cwd(), 'ops'),
  base: '/',
  plugins: [react()],
  build: {
    outDir: resolve(process.cwd(), 'dist-ops'),
    emptyOutDir: true,
    rollupOptions: {input: resolve(process.cwd(), 'ops/index.html')},
  },
});
