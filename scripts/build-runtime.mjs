import { build } from 'esbuild'

await build({
  entryPoints: ['src/lib/runtime.ts'],
  bundle: true,
  format: 'cjs',
  outfile: 'dist/server/runtime.cjs',
  platform: 'node',
  target: 'node22'
})
