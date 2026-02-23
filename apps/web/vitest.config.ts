/**
 * Vitest Configuration for Next.js Web Application
 *
 * @see https://vitest.dev/config/
 */
import { defineConfig } from 'vitest/config';
import type { PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react() as PluginOption],
  test: {
    // Test environment
    environment: 'jsdom',

    // Global test setup
    globals: true,
    setupFiles: ['./vitest.setup.ts'],

    // Test file patterns
    include: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['stores/**/*.ts', 'hooks/**/*.ts', 'lib/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/__tests__/**',
        '**/*.test.{ts,tsx}',
        '**/index.ts',
      ],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },

    // Performance
    pool: 'forks',
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@repo/utils': path.resolve(__dirname, '../../packages/utils'),
      '@repo/types': path.resolve(__dirname, '../../packages/types'),
      '@repo/config': path.resolve(__dirname, '../../packages/config'),
      '@repo/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@repo/constants': path.resolve(
        __dirname,
        '../../packages/constants/src',
      ),
      '@repo/validators': path.resolve(
        __dirname,
        '../../packages/validators/src',
      ),
      '@repo/contracts': path.resolve(
        __dirname,
        '../../packages/contracts/src',
      ),
    },
  },
});
