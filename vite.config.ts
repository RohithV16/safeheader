import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { build as esbuild } from 'esbuild';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  plugins: [
    react(),
    {
      name: 'bundle-service-worker',
      apply: 'build',
      async closeBundle() {
        await esbuild({
          entryPoints: [resolve(__dirname, 'src/background/service-worker.ts')],
          outfile: resolve(__dirname, 'dist/service-worker.js'),
          bundle: true,
          target: 'chrome113',
          format: 'esm',
          minify: true,
        });
      },
    },
  ],
  esbuild: {
    legalComments: 'none',
  },
  build: {
    target: 'chrome113',
    minify: 'esbuild',
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup.html'),
        sidepanel: resolve(__dirname, 'src/sidepanel.html'),
        options: resolve(__dirname, 'src/options.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
