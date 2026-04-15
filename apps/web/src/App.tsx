import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Cards } from '@/pages/Cards'
import { SetsPage } from '@/pages/Sets'
import { WatchlistPage } from '@/pages/Watchlist'
import { BuySignals } from '@/pages/BuySignals'
import { CardShowPage } from '@/pages/CardShow'
import { AlertsPage } from '@/pages/Alerts'
import { TrackRecordPage } from '@/pages/TrackRecord'
import { AnalyticsPage } from '@/pages/Analytics'
import { LoginPage } from '@/pages/Login'
import { RegisterPage } from '@/pages/Register'
import { PrivacyPage } from '@/pages/Privacy'
import { TermsPage } from '@/pages/Terms'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { CookieConsent } from '@/components/CookieConsent'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="sets" element={<SetsPage />} />
          <Route path="cards" element={<Cards />} />
          <Route path="analytics" element={<ProtectedRoute requiredRole="premium"><AnalyticsPage /></ProtectedRoute>} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="signals" element={<BuySignals />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="track-record" element={<TrackRecordPage />} />
          <Route path="card-show" element={<CardShowPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
        </Route>
      </Routes>
      <CookieConsent />
    </BrowserRouter>
  )
}
