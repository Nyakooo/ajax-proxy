import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@proxy/protocol': fileURLToPath(new URL('../protocol/src/index.ts', import.meta.url)),
      '@proxy/v3-domain': fileURLToPath(new URL('../v3-domain/src/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
