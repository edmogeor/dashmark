import { createContext, useContext, useState, type ReactNode } from 'react'

type TooltipController = {
  activeTooltip: string | null
  setActiveTooltip: (tooltip: string | null) => void
}

const TooltipControllerContext = createContext<TooltipController | null>(null)

export function TooltipControllerProvider({ children }: { children: ReactNode }) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)

  return <TooltipControllerContext.Provider value={{ activeTooltip, setActiveTooltip }}>{children}</TooltipControllerContext.Provider>
}

export function useTooltipController(): TooltipController {
  const controller = useContext(TooltipControllerContext)
  if (!controller) throw new Error('TooltipControllerProvider is required')
  return controller
}
