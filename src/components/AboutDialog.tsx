import { useEffect, useState } from 'react'
import { CircleCheck, CircleX, ExternalLink, Info, LoaderCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { APP_VERSION, BUY_ME_A_COFFEE_URL, GITHUB_URL } from '@/lib/version'

type VersionResponse = { version: string; update?: { tagName: string; url: string } }

const brandMarkPath = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/logo-mark.svg`
const versionApiPath = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/version`
const isDemo = __DASHMARK_DEMO__
const displayedVersion = isDemo && __DASHMARK_DEMO_VERSION__ ? __DASHMARK_DEMO_VERSION__ : undefined

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.2-3.37-1.2-.46-1.19-1.12-1.51-1.12-1.51-.91-.64.07-.63.07-.63 1.01.08 1.54 1.06 1.54 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.34 9.34 0 0 1 12 6.94c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.93-2.35 4.8-4.58 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.24 10.24 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
    </svg>
  )
}

export function AboutDialog() {
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState<VersionResponse>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isDemo || !open || version || loading) return
    setLoading(true)
    void fetch(versionApiPath)
      .then(async (response) => (response.ok ? (response.json() as Promise<VersionResponse>) : undefined))
      .then(setVersion)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [loading, open, version])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="About Dashmark"
          className="dashmark-about-button inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Info className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center text-center">
          <img src={brandMarkPath} alt="" className="mb-2 h-10 w-10" />
          <DialogTitle>Dashmark</DialogTitle>
          <DialogDescription>A lightweight dashboard of links to your Docker services.</DialogDescription>
          <p className="text-sm text-muted-foreground">
            Created by{' '}
            <a href="https://github.com/edmogeor" target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline">
              edmogeor
            </a>
          </p>
          <p className="text-xs text-muted-foreground">Copyright © 2026 edmogeor</p>
        </DialogHeader>
        <div className="space-y-3 rounded-md border bg-muted/30 p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{isDemo ? 'Latest stable version' : 'Installed version'}</span>
            <code className="font-medium">v{displayedVersion ?? version?.version ?? APP_VERSION}</code>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Checking for updates
            </div>
          )}
          {version?.update && (
            <a href={version.update.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 font-medium text-primary hover:underline">
              <span className="flex items-center gap-2">
                <CircleX className="h-4 w-4" /> Update available: {version.update.tagName}
              </span>
              <ExternalLink className="h-4 w-4 shrink-0" />
            </a>
          )}
          {(isDemo || (version && !version.update)) && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> You are up to date.
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" asChild>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              <GitHubIcon /> GitHub <ExternalLink />
            </a>
          </Button>
          <a href={BUY_ME_A_COFFEE_URL} target="_blank" rel="noreferrer" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none">
            <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" className="h-8 w-auto" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
