import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      // Test against the shared SOURCE, so a failing test points at the real
      // file rather than at a stale dist build.
      '@pos/shared': path.resolve(dir, '../../packages/shared/src/index.ts'),
      '@': path.resolve(dir, './src'),
    },
  },
});
