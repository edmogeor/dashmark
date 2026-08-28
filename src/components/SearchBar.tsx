import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { strings } from '@/lib/strings'

type SearchBarProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function SearchBar({ value, onChange, disabled }: SearchBarProps) {
  return (
    <div className="dashmark-search relative">
      <Search className="dashmark-search-icon absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder={strings.search.placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="dashmark-search-input border-0 bg-card pl-10 pr-10 text-sm focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[0.9375rem] md:text-[0.9375rem] lg:text-base"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={disabled}
          aria-label={strings.search.clear}
          className="dashmark-search-clear absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
