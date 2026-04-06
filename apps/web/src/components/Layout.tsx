import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/', label: 'Dashboard' },
  { to: '/sets', label: 'Sets' },
  { to: '/cards', label: 'Cards' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/signals', label: 'Buy Signals' },
  { to: '/card-show', label: 'Card Show Mode' },
]

export function Layout() {
  const loc = useLocation()
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <Link to="/" className="text-xl font-semibold tracking-tight text-primary">
            PokéEdge
          </Link>
          <nav className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  loc.pathname === t.to
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
