import React, { lazy, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import HomePage from './pages/HomePage'
import { applyRouteMetadata } from './lib/metadata'
import { parseHashRoute } from './lib/route'
import './styles.css'

const OfferPage = lazy(() => import('./pages/OfferPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const LegalPage = lazy(() => import('./pages/LegalPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const PaymentReturnPage = lazy(() => import('./pages/PaymentReturnPage'))

function App() {
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash))
  useEffect(() => {
    const update = () => { setRoute(parseHashRoute(window.location.hash)); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  useEffect(() => { applyRouteMetadata(route.name) }, [route.name])

  let page = <HomePage />
  if (route.name === 'offer') page = <OfferPage token={route.token} query={route.query} />
  if (route.name === 'paymentReturn') page = <PaymentReturnPage query={route.query} />
  if (route.name === 'admin') page = <AdminPage />
  if (route.name === 'privacy' || route.name === 'terms') page = <LegalPage type={route.name} />
  if (route.name === 'notFound') page = <NotFoundPage />
  return <Suspense fallback={<main className="route-loading" aria-live="polite">Loading…</main>}>{page}</Suspense>
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
)
