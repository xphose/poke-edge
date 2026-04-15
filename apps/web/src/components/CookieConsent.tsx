import { useState, useEffect } from 'react'

const COOKIE_KEY = 'pokegrails_cookie_consent'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(COOKIE_KEY)) {
      const timer = setTimeout(() => setVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  if (!visible) return null

  const accept = () => {
    localStorage.setItem(COOKIE_KEY, 'accepted')
    setVisible(false)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-center text-xs text-muted-foreground sm:text-left sm:text-sm">
          We use cookies for authentication and to remember your preferences.
          By continuing, you agree to our{' '}
          <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
        </p>
        <button
          onClick={accept}
          className="shrink-0 rounded-lg bg-primary px-5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:text-sm"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
