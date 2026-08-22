import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock3, FileText, ShieldCheck } from 'lucide-react'
import { PageShell } from '../components/Chrome'
import { loadOffer, startPayment } from '../lib/backend'
import { formatDateTime, formatMoney } from '../lib/format'

function StatusNotice({ offer, returned }) {
  if (offer.status === 'PAID' || offer.paymentStatus === 'CAPTURED') {
    return <div className="offer-notice paid-notice" role="status"><CheckCircle2 /> <span><strong>Payment verified.</strong> Your order is confirmed for production.</span></div>
  }
  if (offer.status === 'EXPIRED') return <div className="offer-notice"><Clock3 /> <span><strong>This offer has expired.</strong> It cannot be paid and no production capacity is reserved.</span></div>
  if (['CANCELLED', 'REFUNDED'].includes(offer.status)) return <div className="offer-notice"><span><strong>Offer status: {offer.status.toLowerCase()}.</strong> Payment is unavailable.</span></div>
  if (returned) return <div className="offer-notice" role="status"><Clock3 /> <span><strong>Waiting for verified payment.</strong> Returning from the provider does not by itself confirm payment. This page will update when the server verifies it.</span></div>
  return null
}

export default function OfferPage({ token, query }) {
  const [offer, setOffer] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const [paying, setPaying] = useState('')
  const returned = query.get('payment') === 'returned'
  const [hasReturned, setHasReturned] = useState(returned)

  const refresh = useCallback(async () => {
    try {
      const result = await loadOffer(token)
      setOffer(result)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!hasReturned || !offer?.payable) return undefined
    const interval = window.setInterval(refresh, 5000)
    const timeout = window.setTimeout(() => window.clearInterval(interval), 120000)
    return () => { window.clearInterval(interval); window.clearTimeout(timeout) }
  }, [hasReturned, offer?.payable, refresh])

  async function pay(method) {
    setPaying(method)
    setError('')
    try {
      const result = await startPayment(token, offer.termsVersion, method)
      if (method === 'MOCK') {
        window.history.replaceState(null, '', `${window.location.pathname}#/offer/${encodeURIComponent(token)}?payment=returned`)
        setHasReturned(true)
        setPaying('')
        await refresh()
        return
      }
      window.location.assign(result.checkoutUrl)
    } catch (paymentError) {
      setError(paymentError.message)
      setPaying('')
      await refresh()
    }
  }

  return (
    <PageShell>
      <section className="offer-page" aria-labelledby="offer-title">
        <div className="offer-kicker"><ShieldCheck size={18} /> Private offer</div>
        {loading && <p className="loading-copy" role="status">Loading the protected offer…</p>}
        {error && !offer && <div className="form-message error-message" role="alert">{error}</div>}
        {offer && (
          <>
            <div className="offer-heading">
              <div><p className="eyebrow">{offer.reference} · version {offer.version}</p><h1 id="offer-title">{offer.projectTitle}</h1></div>
              <span className={`status-pill status-${offer.status.toLowerCase()}`}>{offer.status.replace('_', ' ')}</span>
            </div>
            <StatusNotice offer={offer} returned={hasReturned} />
            {error && <div className="form-message error-message" role="alert">{error}</div>}
            <div className="offer-layout">
              <div className="offer-main">
                {offer.attachments.length > 0 && (
                  <section className="offer-block"><h2>Drawing and references</h2><div className="asset-grid">
                    {offer.attachments.map((asset) => asset.mimeType === 'application/pdf'
                      ? <a className="asset-card file-asset" key={asset.url} href={asset.url} target="_blank" rel="noreferrer"><FileText /> <span>{asset.name}</span></a>
                      : <a className="asset-card" key={asset.url} href={asset.url} target="_blank" rel="noreferrer"><img src={asset.url} alt={asset.name} /><span>{asset.name}</span></a>)}
                  </div></section>
                )}
                <section className="offer-block"><h2>Exact scope</h2><p className="pre-wrap">{offer.specification}</p></section>
                <section className="offer-block"><h2>Materials and finish</h2><p className="pre-wrap">{offer.materialsFinish}</p></section>
                <section className="offer-block"><h2>Delivery or pickup</h2><p className="pre-wrap">{offer.deliveryTerms}</p></section>
                <section className="offer-block"><h2>Applicable terms · {offer.termsVersion}</h2><p className="pre-wrap terms-copy">{offer.termsSnapshot}</p></section>
              </div>
              <aside className="offer-summary" aria-label="Offer total and payment">
                <p className="summary-label">Total payable</p>
                <strong className="offer-total">{formatMoney(offer.totalMinor, offer.currency)}</strong>
                <dl>
                  <div><dt>Work</dt><dd>{formatMoney(offer.priceMinor, offer.currency)}</dd></div>
                  <div><dt>Delivery</dt><dd>{formatMoney(offer.deliveryChargeMinor, offer.currency)}</dd></div>
                  <div><dt>VAT</dt><dd>{offer.vatTreatment}</dd></div>
                  <div><dt>Agreed production period</dt><dd>{offer.productionWindow}</dd></div>
                  <div><dt>Offer expires</dt><dd>{formatDateTime(offer.expiresAt)}</dd></div>
                </dl>
                <p className="offer-period-note">This period forms part of this exact offer. A fixed delivery date applies only when expressly stated in the offer.</p>
                {offer.payable && offer.paymentMethods.length > 0 && (
                  <>
                    <label className="checkbox-label offer-acceptance">
                      <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                      <span>I have reviewed this exact scope, total, agreed production period and terms version.</span>
                    </label>
                    <div className="payment-actions">
                      {offer.paymentMethods.map((method) => (
                        <button className="primary-button payment-button" key={method} disabled={!accepted || Boolean(paying)} onClick={() => pay(method)}>
                          {method === 'CARD' ? 'Pay by card and start production' : method === 'MOCK' ? 'Create test payment — no real charge' : 'Pay with Vipps and start production'}
                        </button>
                      ))}
                    </div>
                    <small>Payment is the purchase action. Production starts only after server-side payment verification.</small>
                  </>
                )}
                {offer.payable && offer.paymentMethods.length === 0 && <p className="form-message warning-message">Payment is not configured. This offer cannot be purchased yet.</p>}
              </aside>
            </div>
          </>
        )}
      </section>
    </PageShell>
  )
}
