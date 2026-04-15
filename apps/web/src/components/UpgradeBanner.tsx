import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

interface Props {
  message?: string
}

export function UpgradeBanner({ message }: Props) {
  const { user } = useAuth()
  if (!user || user.role !== 'free') return null

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-amber-200">
          {message || 'You are viewing the 3 newest sets. Upgrade to premium for full catalog access and analytics.'}
        </p>
        <Link
          to="/settings"
          className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-amber-400"
        >
          Upgrade
        </Link>
      </div>
    </div>
  )
}

export function FreeTierNotice() {
  const { user } = useAuth()
  if (!user || user.role !== 'free') return null

  return (
    <span className="ml-2 inline-flex items-center rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-400">
      3 newest sets
    </span>
  )
}
