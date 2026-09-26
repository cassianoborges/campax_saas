import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Frontend unit tests: pure functions and static renders only, so the node environment is enough.
// TZ is pinned so date formatting is the same on any machine (the funerárias are in Brazil).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    env: { TZ: 'America/Sao_Paulo' },
  },
});
