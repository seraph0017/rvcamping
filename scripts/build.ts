import { build } from 'esbuild'
import { existsSync, mkdirSync } from 'node:fs'

mkdirSync('public', { recursive: true })

if (!existsSync('node_modules')) {
  console.error('先跑 npm install')
  process.exit(1)
}

const common = {
  bundle: true,
  minify: true,
  target: ['es2020'],
  format: 'esm' as const,
  logLevel: 'info' as const,
  legalComments: 'none' as const,
}

await build({
  ...common,
  entryPoints: ['client/staff.ts'],
  outfile: 'public/staff.js',
})

await build({ ...common, entryPoints: ['client/village.js'], outfile: 'public/village.js' })

await build({
  ...common,
  entryPoints: ['client/sw.ts'],
  outfile: 'public/sw.js',
  format: 'iife',
})

console.log('\n✓ 构建完成：public/staff.js, public/village.js, public/sw.js')
