import { cn } from '@/lib/utils'
import { Check, ChevronDown, ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { strings } from '@/i18n'

type CategoryFilterProps = {
  categories: { name: string; count: number }[]
  total: number
  selected: string | null
  onSelect: (category: string | null) => void
  disabled?: boolean
}

export function CategoryFilter({ categories, total, selected, onSelect, disabled }: CategoryFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="dashmark-category-filter h-10 w-10 cursor-pointer justify-center gap-0 border-0 bg-muted px-0 shadow-none hover:bg-surface-hover focus-visible:ring-0 data-[state=open]:bg-surface-hover dark:bg-card dark:hover:bg-surface-hover dark:data-[state=open]:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-[200px] sm:justify-start sm:gap-2 sm:px-3"
        >
          <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="dashmark-category-filter-label hidden min-w-0 truncate sm:inline">{selected ?? strings.category.all}</span>
          <span className="hidden flex-1 sm:inline" />
          <ChevronDown className="hidden h-4 w-4 shrink-0 sm:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="dashmark-category-filter-menu w-[200px] bg-muted dark:bg-card">
        <DropdownMenuItem className="dashmark-category-filter-option" onClick={() => onSelect(null)}>
          <Check className={cn('opacity-0', selected === null && 'opacity-100')} />
          <span className="flex-1">{strings.category.all}</span>
          <span className="text-xs text-muted-foreground">{total}</span>
        </DropdownMenuItem>
        {categories.map(({ name, count }) => (
          <DropdownMenuItem key={name} className="dashmark-category-filter-option" onClick={() => onSelect(name)}>
            <Check className={cn('opacity-0', selected === name && 'opacity-100')} />
            <span className="flex-1">{name}</span>
            <span className="text-xs text-muted-foreground">{count}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
