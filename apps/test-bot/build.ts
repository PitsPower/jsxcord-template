import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(
  readFileSync('./package.json', 'utf-8'),
)
const dependencies: Record<string, string> = packageJson.dependencies ?? {}
const devDependencies: Record<string, string> = packageJson.devDependencies ?? {}

const allDependencies: Record<string, string> = [
  ...Object.entries(dependencies),
  ...Object.entries(devDependencies),
]
  .filter(([_, version]) => !version.includes('workspace'))
  .reduce((acc, [name, version]) => ({ ...acc, [name]: version }), {})

Bun.build({
  entrypoints: ['src/index.tsx'],
  target: 'bun',
  minify: true,
  external: [...Object.keys(allDependencies)],
  outdir: 'dist',
})
