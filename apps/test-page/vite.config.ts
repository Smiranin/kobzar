import { defineConfig } from 'vitest/config';

/** Port of the Kobzar service; matches `port` in kobzar.example.yaml. */
const SERVICE_URL = 'http://127.0.0.1:4900';
/** Fixed, because the dev task allows exactly this origin (KOBZAR_DEV_ORIGIN in the service). */
const DEV_PORT = 5173;

export default defineConfig({
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: 'localhost',
    // Dev only. changeOrigin gives the service its own Host, which its guard requires; the
    // browser's Origin (this dev server) stays and is allowed by the dev task.
    proxy: { '/v1': { target: SERVICE_URL, changeOrigin: true } },
  },
  test: { name: 'test-page' },
});
