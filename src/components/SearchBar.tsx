import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLocalization } from './localization'

type SearchBarProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function SearchBar({ value, onChange, disabled }: SearchBarProps) {
  const { messages } = useLocalization()
  return (
    <div className="dashmark-search relative">
      <Search className="dashmark-search-icon absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder={messages.search.placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="dashmark-search-input border-0 bg-muted ps-10 pe-10 text-sm focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card sm:text-[0.9375rem] md:text-[0.9375rem] lg:text-base"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={disabled}
          aria-label={messages.search.clear}
          className="dashmark-search-clear absolute end-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
