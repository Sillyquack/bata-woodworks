import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { PageShell } from '../components/Chrome'
import { takePaymentReturn } from '../lib/payment-return'

export default function PaymentReturnPage({ query }) {
  const [missing, setMissing] = useState(false)
  const reference = query.get('reference') ?? ''

  useEffect(() => {
    const token = takePaymentReturn(reference)
    if (!token) {
      setMissing(true)
      return
    }
    window.location.replace(`${import.meta.env.BASE_URL}#/offer/${encodeURIComponent(token)}?payment=returned`)
  }, [reference])

  return (
    <PageShell>
      <section className="not-found-page" aria-live="polite">
        <Clock3 size={28} />
        <p className="eyebrow">Payment return</p>
        <h1>{missing ? 'Reopen your private offer.' : 'Returning to your private offer…'}</h1>
        {missing && <p>This browser no longer has the private offer link. Reopen the original offer email; returning from the payment provider never marks an order paid by itself.</p>}
      </section>
    </PageShell>
  )
}
