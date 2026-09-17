import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// @midnightntwrk/ledger-v9 ships a wasm-bindgen bundle whose browser entry
// does `import * as wasm from './x_bg.wasm'`. vite-plugin-wasm turns that ESM
// integration into a fetch + instantiate behind a top-level await, which the
// esnext build target emits natively (vite-plugin-top-level-await is not
// needed and crashes on this swc version).
export default defineConfig({
  plugins: [react(), wasm()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      // @midnight-ntwrk/wallet-sdk-address-format uses the Node Buffer API;
      // src/polyfills.ts installs this package on globalThis before it loads.
      buffer: 'buffer',
      // @subsquid/scale-codec (via wallet-sdk-address-format) requires Node's
      // assert; Vite would otherwise externalize it to an empty module.
      assert: path.resolve(here, 'src/shims/assert.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@midnightntwrk/ledger-v9'],
    esbuildOptions: { target: 'esnext' },
  },
  build: { target: 'esnext' },
  server: {
    port: 5173,
    host: true,
  },
});
