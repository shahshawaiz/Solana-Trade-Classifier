import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      nodePolyfills({
        include: ['path', 'stream', 'util', 'events', 'assert', 'crypto', 'http', 'https', 'buffer'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      })
    ],
    build: {
      minify: false,
      sourcemap: false,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        external: [
          '@drift-labs/sdk',
          '@zetamarkets/sdk',
          '@coral-xyz/anchor',
          '@project-serum/anchor'
        ]
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
