import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@proxy/shared-utils': resolve('packages/shared-utils/src/index.ts'),
      '@proxy/v3-domain': resolve('packages/v3-domain/src/index.ts'),
      '@proxy/protocol': resolve('packages/protocol/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        'packages/v3-domain/src/backup.ts': { branches: 95, perFile: true },
        'packages/v3-domain/src/ruleMatching.ts': { branches: 95, perFile: true },
        'packages/proxy-lib/src/v3/fetch.ts': { branches: 95, perFile: true },
        'packages/proxy-lib/src/v3/responseAction.ts': { branches: 95, perFile: true },
        'packages/proxy-lib/src/v3/xhr.ts': { branches: 95, perFile: true },
      },
    },
  },
})
