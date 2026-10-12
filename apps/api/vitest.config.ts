import { defineConfig } from 'vitest/config';

/**
 * Two projects: fast unit tests next to the code, and HTTP-level e2e tests
 * (fake executor, fresh database per file). Coverage merges both, so it
 * reflects controllers and services exercised end to end.
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      // Just under the current level, so coverage cannot silently regress.
      thresholds: { lines: 85, statements: 85, functions: 80, branches: 75 },
    },
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          setupFiles: ['test/setup-e2e.ts'],
        },
      },
    ],
  },
});
