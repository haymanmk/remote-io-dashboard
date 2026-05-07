import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/plugin/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  tsconfig: 'tsconfig.plugin.json',
  noExternal: [/.*/],
  banner: {
    js: [
      'import { createRequire as __nodalcoreCreateRequire } from "node:module";',
      'const require = __nodalcoreCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  dts: true,
  sourcemap: false,
  clean: true,
})
