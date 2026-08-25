import packageJson from '../../package.json'

export const APP_VERSION = packageJson.version
export const GITHUB_URL = 'https://github.com/edmogeor/dashmark'
export const BUY_ME_A_COFFEE_URL = 'https://www.buymeacoffee.com/edmogeor'
export const LATEST_RELEASE_URL = 'https://api.github.com/repos/edmogeor/dashmark/releases/latest'

function parseVersion(value: string): [number, number, number, boolean] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(value)
  if (!match) return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3]), !match[4]]
}

export function isNewerVersion(release: string, current = APP_VERSION): boolean {
  const latest = parseVersion(release)
  const installed = parseVersion(current)
  if (!latest || !installed || !latest[3] || !installed[3]) return false

  for (const index of [0, 1, 2] as const) {
    if (latest[index] !== installed[index]) return latest[index] > installed[index]
  }
  return false
}
