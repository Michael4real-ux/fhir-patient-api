import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  minify: process.env.NODE_ENV === 'production',
  target: 'es2020',
  outDir: 'dist',
  treeshake: true,
  bundle: true,
  external: ['axios', 'jsonwebtoken'],
  esbuildOptions(options) {
    options.conditions = ['module'];
    options.mainFields = ['module', 'main'];
  },
  onSuccess: async () => {
    console.log('✅ Build completed successfully');
    console.log('📦 Package ready for distribution');
  },
});