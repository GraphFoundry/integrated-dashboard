import { useEffect, useMemo, useState } from 'react'
import {
  applyThemeToDocument,
  getSystemTheme,
  parseThemeMode,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode,
} from './theme'
import { ThemeContext } from './ThemeContext'

function getInitialTheme(): ThemeMode {
  if (typeof document === 'undefined') {
    return 'light'
  }

  const documentTheme = parseThemeMode(document.documentElement.getAttribute('data-theme'))
  if (documentTheme) {
    return documentTheme
  }

  return readStoredTheme() ?? 'light'
}

function getInitialResolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') {
    return 'light'
  }

  const attr = document.documentElement.getAttribute('data-resolved-theme')
  if (attr === 'light' || attr === 'dark') {
    return attr
  }

  return resolveTheme(getInitialTheme(), getSystemTheme())
}

export function ThemeProvider({ children }: { readonly children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(getInitialResolvedTheme)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateTheme = () => {
      const nextResolvedTheme = resolveTheme(theme, getSystemTheme())
      setResolvedTheme(nextResolvedTheme)
      applyThemeToDocument(theme, nextResolvedTheme)

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme)
      } catch {
        // Ignore storage write failures in restricted environments.
      }
    }

    updateTheme()

    if (theme !== 'system') {
      return undefined
    }

    const handleSystemThemeChange = () => updateTheme()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemThemeChange)
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }

    mediaQuery.addListener(handleSystemThemeChange)
    return () => mediaQuery.removeListener(handleSystemThemeChange)
  }, [theme])

  const contextValue = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme]
  )

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}
