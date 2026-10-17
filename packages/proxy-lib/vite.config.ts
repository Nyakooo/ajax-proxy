import { defineConfig } from 'vite'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'lib',
    },
    rollupOptions: {
      output: [
        {
          format: 'umd',
          entryFileNames: '[name].umd.js',
          sourcemap: true,
          dir: resolve(__dirname, 'lib'),
        },
        {
          format: 'esm',
          entryFileNames: '[name].esm.js',
          sourcemap: true,
          dir: resolve(__dirname, 'lib'),
        }
      ]
    }
  },
  plugins: []
})
