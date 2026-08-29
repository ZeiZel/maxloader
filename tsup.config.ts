import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/entry.ts', 'src/page-hook-entry.ts', 'src/background-entry.ts'],
  format: ['iife'],
  target: 'es2020',
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  outDir: 'dist',
  minify: true,
  treeshake: true,
  dts: false,
  onSuccess: [
    'cp manifest.json dist/',
    'cp src/styles.css dist/',
    'cp -R public/. dist/',
    'mv dist/entry.global.js dist/content.js',
    'mv dist/page-hook-entry.global.js dist/page-hook.js',
    'mv dist/background-entry.global.js dist/background.js',
  ].join(' && '),
});
