export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'

export function parseThemeMode(value: string | null | undefined): ThemeMode | null {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value
  }
  return null
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(theme: ThemeMode, systemTheme: ResolvedTheme): ResolvedTheme {
  return theme === 'system' ? systemTheme : theme
}

export function applyThemeToDocument(theme: ThemeMode, resolvedTheme: ResolvedTheme): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-resolved-theme', resolvedTheme)
  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.style.colorScheme = resolvedTheme
}

export function readStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return parseThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return null
  }
}
