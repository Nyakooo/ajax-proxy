import { defineConfig } from 'vite'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'lib',
    },
    rollupOptions: {
      output: [
        {
          format: 'umd',
          name: 'lib',
          entryFileNames: '[name].umd.js',
          dir: resolve(__dirname, 'lib'),
        },
        {
          format: 'esm',
          entryFileNames: '[name].esm.js',
          dir: resolve(__dirname, 'lib'),
        },
      ],
    },
  },
  plugins: [],
})
