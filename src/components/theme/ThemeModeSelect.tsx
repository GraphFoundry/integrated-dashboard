import { Monitor, Moon, Sun } from 'lucide-react'
import { cn, controlInputMutedClass } from '@/components/common/uiClassTokens'
import { Select } from '@/components/ui'
import { useTheme } from '@/theme/useTheme'

function ThemeIcon({ theme }: { readonly theme: 'light' | 'dark' | 'system' }) {
  if (theme === 'light') {
    return <Sun aria-hidden className="h-4 w-4" />
  }
  if (theme === 'dark') {
    return <Moon aria-hidden className="h-4 w-4" />
  }
  return <Monitor aria-hidden className="h-4 w-4" />
}

export default function ThemeModeSelect() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]">
        <ThemeIcon theme={theme} />
      </span>
      <Select
        aria-label="Toggle theme"
        value={theme}
        onChange={(event) => setTheme(event.target.value as 'light' | 'dark' | 'system')}
        className={cn(controlInputMutedClass, 'h-9 min-w-[9rem] px-3 py-0 text-xs sm:text-sm')}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System ({resolvedTheme})</option>
      </Select>
    </div>
  )
}
