import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['eval/**/*.eval.ts'],
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 60 * 1000,
    fileParallelism: false,
  },
});
