import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { applyThemeMode, getStoredThemeMode, setStoredThemeMode, type ThemeMode } from '@/lib/theme'
import { HelpMenuButton } from '@/components/help-center'
import { useAuth } from '@/lib/auth'

const tabs = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sets', label: 'Sets', end: false },
  { to: '/cards', label: 'Cards', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
  { to: '/alerts', label: 'Alerts', end: false },
  { to: '/watchlist', label: 'Watchlist', end: false },
  { to: '/signals', label: 'Buy Signals', end: false },
  { to: '/track-record', label: 'Track Record', end: false },
  { to: '/card-show', label: 'Card Show', end: false },
]

export function Layout() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const { user, logout } = useAuth()

  useEffect(() => {
    applyThemeMode(themeMode)
    setStoredThemeMode(themeMode)
  }, [themeMode])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])


  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto flex max-w-7xl flex-col gap-1.5 px-4 py-2 sm:gap-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
                aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setMobileNavOpen((o) => !o)}
              >
                {mobileNavOpen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
                )}
              </button>
              <Link to="/" className="text-lg font-semibold tracking-tight text-primary sm:text-xl">
                PokeGrails
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <p className="hidden max-w-md text-xs text-muted-foreground lg:block">
                Pokémon TCG pricing signals, pull-cost vs demand, and buy links
              </p>
              <HelpMenuButton />
              {user ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {user.username}
                    {user.role !== 'free' && (
                      <span className="ml-1 rounded bg-primary/20 px-1 py-0.5 text-[10px] uppercase text-primary">
                        {user.role}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link to="/login" className="rounded px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10">
                  Sign in
                </Link>
              )}
              <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
                {(['light', 'dark', 'pokemon', 'system'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={cn(
                      'rounded px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors sm:px-2.5',
                      themeMode === m
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    onClick={() => setThemeMode(m)}
                    aria-pressed={themeMode === m}
                    title={`Use ${m} theme`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Desktop nav — horizontal tabs */}
          <nav
            className="hidden gap-1 md:flex md:flex-wrap"
            aria-label="Main"
          >
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-secondary font-medium text-secondary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          {/* Mobile nav — dropdown panel */}
          {mobileNavOpen && (
            <nav
              className="flex flex-col gap-0.5 border-t border-border pt-2 md:hidden"
              aria-label="Main"
            >
              {tabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-secondary text-secondary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 py-4 sm:px-4 sm:py-6">
        <Outlet />
      </main>
      <footer className="border-t border-border py-3 text-center text-xs text-muted-foreground sm:py-4">
        <div className="flex items-center justify-center gap-3">
          <span>&copy; {new Date().getFullYear()} PokeGrails</span>
          <span className="text-border">·</span>
          <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
          <span className="text-border">·</span>
          <Link to="/terms" className="hover:text-foreground hover:underline">Terms</Link>
        </div>
        <p className="mt-1 text-[10px]">
          Not financial advice. All predictions are model-generated estimates.
        </p>
      </footer>
    </div>
  )
}
