import { ArrowLeft } from 'lucide-react'
import { PageShell } from '../components/Chrome'

export default function NotFoundPage() {
  return (
    <PageShell>
      <section className="not-found-page" aria-labelledby="not-found-title">
        <p className="eyebrow">404</p>
        <h1 id="not-found-title">This page could not be found.</h1>
        <p>The link may be incomplete or no longer available. Private offers must be opened from the complete link in the email.</p>
        <a className="primary-button" href={import.meta.env.BASE_URL}><ArrowLeft size={18} /> Return home</a>
      </section>
    </PageShell>
  )
}
