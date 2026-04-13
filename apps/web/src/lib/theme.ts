export type ThemeMode = 'light' | 'dark' | 'system' | 'pokemon'

const THEME_KEY = 'pokeedge_theme_mode'

function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function getStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system' || raw === 'pokemon') return raw
  } catch {
    // ignore
  }
  return 'system'
}

export function setStoredThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    // ignore
  }
}

export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement
  const pokemon = mode === 'pokemon'
  const shouldUseDark = mode === 'dark' || (mode === 'system' && prefersDark())
  root.classList.toggle('pokemon', pokemon)
  root.classList.toggle('dark', shouldUseDark)
}

export function initThemeMode() {
  const mode = getStoredThemeMode()
  applyThemeMode(mode)
}
