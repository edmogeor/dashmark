import { execFileSync } from 'node:child_process'
import path from 'node:path'

const stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)

if (stagedFiles.length > 0) {
  execFileSync(process.execPath, [path.resolve('node_modules/prettier/bin/prettier.cjs'), '--write', '--ignore-unknown', ...stagedFiles], { stdio: 'inherit' })
  execFileSync('git', ['add', '--', ...stagedFiles])
}
