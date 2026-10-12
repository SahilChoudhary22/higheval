import { defineConfig } from 'vitest/config';

/** Opt-in tests against the real Hermes runtime and a live model provider. */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.live-spec.ts'],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
