import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cadesplugin_api.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  splitting: false,
  treeshake: true,
});

