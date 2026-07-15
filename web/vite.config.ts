import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { productionCspPlugin } from './src/csp';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      ...(command === 'build' ? [productionCspPlugin(env.VITE_FIREBASE_AUTH_DOMAIN)] : []),
    ],
    server: { port: 5173 },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./vitest.setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
