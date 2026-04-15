import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth, type UserRole } from '@/lib/auth'

interface Props {
  children: React.ReactNode
  requiredRole?: UserRole
}

export function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (requiredRole === 'admin' && user.role !== 'admin') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
        <p className="text-sm text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    )
  }

  if (requiredRole === 'premium' && user.role === 'free') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">Premium Feature</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Advanced analytics, AI models, and full catalog access are available to premium subscribers.
          </p>
          <Link
            to="/settings"
            className="mt-4 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Upgrade to Premium
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
