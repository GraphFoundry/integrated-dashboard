import { createContext } from 'react'
import type { ResolvedTheme, ThemeMode } from './theme'

export interface ThemeContextValue {
  readonly theme: ThemeMode
  readonly resolvedTheme: ResolvedTheme
  readonly setTheme: (nextTheme: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
