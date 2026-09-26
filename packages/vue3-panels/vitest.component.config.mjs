import { mergeConfig, defineConfig } from 'vitest/config'
import viteConfig from './vite.config.mjs'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['test/**/*.component.spec.ts'],
      environment: 'jsdom',
    },
  })
)
