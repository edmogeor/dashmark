import { spawn } from 'node:child_process'

export function runJq(expression: string, input: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.JQ_PATH ?? 'jq', ['--', expression])
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString().trim() || `jq exited with code ${code}`))
        return
      }

      const output = Buffer.concat(stdout).toString()
      if (!output) {
        resolve(undefined)
        return
      }

      try {
        resolve(JSON.parse(output))
      } catch {
        resolve(output)
      }
    })
    child.stdin.end(JSON.stringify(input))
  })
}
