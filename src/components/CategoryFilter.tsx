import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { strings } from '@/lib/strings'

type CategoryFilterProps = {
  categories: string[]
  selected: string | null
  onSelect: (category: string | null) => void
  disabled?: boolean
}

export function CategoryFilter({ categories, selected, onSelect, disabled }: CategoryFilterProps) {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-10 w-10 cursor-pointer justify-center gap-0 border-0 px-0 shadow-none hover:bg-surface-hover focus-visible:ring-0 aria-expanded:bg-surface-hover dark:hover:bg-surface-hover dark:aria-expanded:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-[200px] sm:justify-start sm:gap-2 sm:px-3',
            open ? 'bg-surface-hover dark:bg-surface-hover' : 'bg-card dark:bg-card'
          )}
        >
          <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="hidden min-w-0 truncate sm:inline">{selected ?? strings.category.all}</span>
          <span className="hidden flex-1 sm:inline" />
          <ChevronDown className="hidden h-4 w-4 shrink-0 sm:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuItem onClick={() => onSelect(null)}>{strings.category.all}</DropdownMenuItem>
        {categories.map(category => (
          <DropdownMenuItem key={category} onClick={() => onSelect(category)}>
            {category}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
