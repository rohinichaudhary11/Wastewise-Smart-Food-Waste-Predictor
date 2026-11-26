import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', setupFiles: ['./test/setup.js'], testTimeout: 10_000, hookTimeout: 10_000 }
});
