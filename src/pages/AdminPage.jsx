import { useCallback, useEffect, useMemo, useState } from 'react'
import { LogOut, RefreshCw, ShieldCheck, Upload } from 'lucide-react'
import { PageShell } from '../components/Chrome'
import { adminAction, backendConfigured, supabase, uploadOfferAsset } from '../lib/backend'
import { formatDateTime, formatMoney, minorToNok, nokToMinor } from '../lib/format'

const nextActions = {
  NEW: ['REVIEW', 'DECLINED'],
  REVIEW: ['DESIGN', 'DECLINED'],
  DESIGN: ['DECLINED'],
  PAID: ['PRODUCTION'],
  PRODUCTION: ['READY'],
  READY: ['DELIVERED'],
}

function Login({ onLogin }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.get('email'),
      password: data.get('password'),
    })
    setBusy(false)
    if (authError) setError('Sign-in failed. Check the credentials and manager role.')
    else onLogin()
  }
  return (
    <section className="login-card">
      <ShieldCheck size={28} /><p className="eyebrow">Internal</p><h1>Manager order queue</h1>
      <p>Authorized Bata managers only. Public sign-up is disabled.</p>
      {error && <div className="form-message error-message" role="alert">{error}</div>}
      <form onSubmit={submit} className="admin-form">
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section>
  )
}

function OfferEditor({ request, onChanged, setNotice }) {
  const drafts = request.offers.filter((offer) => offer.status === 'DRAFT').sort((a, b) => b.version - a.version)
  const draft = drafts[0]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const values = new FormData(event.currentTarget)
    const priceMinor = nokToMinor(values.get('price'))
    const deliveryChargeMinor = nokToMinor(values.get('deliveryCharge'))
    if (priceMinor == null || deliveryChargeMinor == null) {
      setError('Enter valid NOK amounts with no more than two decimals.')
      setBusy(false)
      return
    }
    try {
      await adminAction({
        action: 'save_offer',
        requestId: request.id,
        offerId: draft?.id,
        projectTitle: values.get('projectTitle'),
        specification: values.get('specification'),
        materialsFinish: values.get('materialsFinish'),
        priceMinor,
        deliveryChargeMinor,
        vatTreatment: values.get('vatTreatment'),
        deliveryTerms: values.get('deliveryTerms'),
        productionWindow: values.get('productionWindow'),
        expiresAt: new Date(values.get('expiresAt')).toISOString(),
        termsVersion: values.get('termsVersion'),
        termsSnapshot: values.get('termsSnapshot'),
      })
      setNotice('Draft offer saved. No price is calculated automatically.')
      await onChanged()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  if (request.status !== 'DESIGN') return null
  const defaultExpiry = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16)
  return (
    <section className="manager-section">
      <div className="manager-section-heading"><div><p className="eyebrow">Commercial terms</p><h3>{draft ? `Draft offer v${draft.version}` : 'Prepare offer'}</h3></div><span>Manager-approved pricing only</span></div>
      {error && <div className="form-message error-message" role="alert">{error}</div>}
      <form className="admin-form" onSubmit={save} key={draft?.id ?? request.id}>
        <label>Project title<input name="projectTitle" required minLength="2" maxLength="240" defaultValue={draft?.project_title ?? ''} /></label>
        <label>Exact specification<textarea name="specification" required minLength="20" rows="7" defaultValue={draft?.specification ?? ''} /></label>
        <label>Materials and finish<textarea name="materialsFinish" required rows="4" defaultValue={draft?.materials_finish ?? ''} /></label>
        <div className="form-row">
          <label>Work price (NOK)<input name="price" inputMode="decimal" required defaultValue={draft ? minorToNok(draft.price_minor) : ''} /></label>
          <label>Delivery charge (NOK)<input name="deliveryCharge" inputMode="decimal" required defaultValue={draft ? minorToNok(draft.delivery_charge_minor) : '0.00'} /></label>
        </div>
        <label>VAT treatment<input name="vatTreatment" required minLength="2" maxLength="500" defaultValue={draft?.vat_treatment ?? ''} placeholder="Use the owner-approved exact wording" /></label>
        <label>Delivery / pickup terms<textarea name="deliveryTerms" required rows="4" defaultValue={draft?.delivery_terms ?? ''} /></label>
        <div className="form-row">
          <label>Production window<input name="productionWindow" required defaultValue={draft?.production_window ?? ''} placeholder="Exact estimate or promised window" /></label>
          <label>Offer expiry<input name="expiresAt" type="datetime-local" required defaultValue={draft ? new Date(draft.expires_at).toISOString().slice(0, 16) : defaultExpiry} /></label>
        </div>
        <label>Approved terms version<input name="termsVersion" required maxLength="80" defaultValue={draft?.terms_version ?? ''} placeholder="Owner-approved identifier" /></label>
        <label>Exact terms shown to customer<textarea name="termsSnapshot" required minLength="20" rows="9" defaultValue={draft?.terms_snapshot ?? ''} /></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save draft offer'}</button>
      </form>
    </section>
  )
}

function RequestDetail({ request, refresh }) {
  const [notes, setNotes] = useState(request.internal_notes ?? '')
  const [readyInstructions, setReadyInstructions] = useState(request.ready_instructions ?? '')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const offers = [...request.offers].sort((a, b) => b.version - a.version)
  const draft = offers.find((offer) => offer.status === 'DRAFT')
  const sent = offers.find((offer) => offer.status === 'SENT')

  useEffect(() => {
    setNotes(request.internal_notes ?? '')
    setReadyInstructions(request.ready_instructions ?? '')
    setNotice('')
    setError('')
    setPreviewUrl('')
  }, [request.id, request.internal_notes, request.ready_instructions])

  async function changeStatus(status = request.status) {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await adminAction({ action: 'set_request', requestId: request.id, status, internalNotes: notes, readyInstructions })
      setNotice(result.notificationSent === false ? 'Status saved, but transactional email failed. Check provider configuration and notification status.' : 'Request updated.')
      await refresh()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function upload(event) {
    const file = event.target.files?.[0]
    if (!file || !draft) return
    setBusy(true); setError('')
    try { await uploadOfferAsset(draft.id, file); setNotice('Offer asset uploaded.'); await refresh() }
    catch (requestError) { setError(requestError.message) }
    finally { setBusy(false); event.target.value = '' }
  }

  async function offerAction(action, offerId) {
    setBusy(true); setError(''); setNotice(''); setPreviewUrl('')
    try {
      const result = await adminAction({ action, offerId })
      setNotice(result.emailSent ? 'Private offer email sent.' : 'Offer issued, but email delivery failed. Use resend after fixing the provider.')
      setPreviewUrl(result.previewUrl ?? '')
      await refresh()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  return (
    <div className="request-detail">
      <div className="detail-heading"><div><p className="eyebrow">{request.public_reference}</p><h2>{request.request_type}</h2></div><span className={`status-pill status-${request.status.toLowerCase()}`}>{request.status}</span></div>
      {notice && <div className="form-message success-message" role="status">{notice}{previewUrl && <><br /><a href={previewUrl} target="_blank" rel="noreferrer">Open local test offer</a></>}</div>}
      {error && <div className="form-message error-message" role="alert">{error}</div>}
      <section className="manager-section customer-input">
        <h3>Customer input</h3>
        <dl className="detail-grid">
          <div><dt>Customer</dt><dd>{request.customer_name}<br /><a href={`mailto:${request.email}`}>{request.email}</a>{request.phone && <><br />{request.phone}</>}</dd></div>
          <div><dt>Location</dt><dd>{request.location}</dd></div>
          <div><dt>Budget</dt><dd>{request.budget_range || 'Not specified'}</dd></div>
          <div><dt>Timing</dt><dd>{request.requested_timeline || 'Not specified'}{request.requested_date && <><br />{request.requested_date}</>}</dd></div>
          <div className="wide"><dt>Description</dt><dd className="pre-wrap">{request.project_description}</dd></div>
          <div><dt>Dimensions</dt><dd className="pre-wrap">{request.rough_dimensions || 'Not supplied'}</dd></div>
          <div><dt>Intended use</dt><dd className="pre-wrap">{request.intended_use || 'Not supplied'}</dd></div>
        </dl>
        {request.attachments.length > 0 && <div className="manager-assets">{request.attachments.map((asset) => <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer">{asset.name}</a>)}</div>}
      </section>
      <section className="manager-section">
        <h3>Internal handling</h3>
        <div className="admin-form">
          <label>Internal notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="5" maxLength="20000" /></label>
          {(request.status === 'PRODUCTION' || request.status === 'READY') && <label>Ready pickup / delivery instructions<textarea value={readyInstructions} onChange={(event) => setReadyInstructions(event.target.value)} rows="4" maxLength="4000" /></label>}
          <div className="admin-actions">
            <button className="secondary-button" onClick={() => changeStatus()} disabled={busy}>Save notes</button>
            {(nextActions[request.status] ?? []).map((status) => <button className={status === 'DECLINED' ? 'danger-button' : 'primary-button'} key={status} onClick={() => changeStatus(status)} disabled={busy}>Move to {status}</button>)}
          </div>
        </div>
      </section>
      <OfferEditor request={request} onChanged={refresh} setNotice={setNotice} />
      {draft && (
        <section className="manager-section">
          <h3>Drawing / offer assets</h3>
          <div className="manager-assets">{draft.attachments.map((asset) => <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer">{asset.name}</a>)}</div>
          <label className="secondary-button upload-button"><Upload size={16} /> Upload JPEG, PNG, WebP or PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={upload} hidden /></label>
          <button className="primary-button" onClick={() => offerAction('send_offer', draft.id)} disabled={busy}>Approve and send private offer v{draft.version}</button>
        </section>
      )}
      {sent && <section className="manager-section"><h3>Active offer v{sent.version}</h3><p>{sent.project_title} · {formatMoney(sent.total_minor, sent.currency)} · expires {formatDateTime(sent.expires_at)}</p><button className="secondary-button" onClick={() => offerAction('resend_offer', sent.id)} disabled={busy}>Rotate link and resend</button></section>}
      {offers.map((offer) => offer.payments?.length > 0 && <section className="manager-section" key={`payments-${offer.id}`}><h3>Payment · offer v{offer.version}</h3>{offer.payments.map((payment) => <div className="payment-row" key={payment.id}><span>{payment.provider.toUpperCase()} / {payment.payment_method}</span><strong>{payment.status}</strong><span>{formatMoney(payment.amount_minor, payment.currency)}</span><small>{payment.provider_reference}</small></div>)}</section>)}
    </div>
  )
}

function Queue() {
  const [requests, setRequests] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminAction({ action: 'list' })
      setRequests(result.requests)
      setSelectedId((current) => current || result.requests[0]?.id || '')
      setError('')
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const selected = useMemo(() => requests.find((request) => request.id === selectedId), [requests, selectedId])

  return (
    <section className="admin-page">
      <div className="admin-toolbar"><div><p className="eyebrow">Internal</p><h1>Order queue</h1></div><div className="admin-actions"><button className="secondary-button" onClick={load}><RefreshCw size={16} /> Refresh</button><button className="secondary-button" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Sign out</button></div></div>
      {error && <div className="form-message error-message" role="alert">{error}</div>}
      <div className="queue-layout">
        <aside className="queue-list" aria-label="Requests">
          {loading && <p>Loading queue…</p>}
          {!loading && requests.length === 0 && <p>No requests yet.</p>}
          {requests.map((request) => <button className={selectedId === request.id ? 'queue-item active' : 'queue-item'} key={request.id} onClick={() => setSelectedId(request.id)}><span>{request.public_reference}</span><strong>{request.request_type}</strong><small>{request.customer_name} · {formatDateTime(request.created_at)}</small><em>{request.status}</em></button>)}
        </aside>
        <div className="queue-detail">{selected && <RequestDetail request={selected} refresh={load} />}</div>
      </div>
    </section>
  )
}

export default function AdminPage() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    if (!supabase) { setSession(null); return undefined }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])
  if (!backendConfigured || !supabase) return <PageShell><div className="legal-gate"><strong>Manager backend not configured.</strong> Supply the public Supabase URL, publishable key and approved privacy version.</div></PageShell>
  if (session === undefined) return <PageShell><p className="loading-copy">Checking manager session…</p></PageShell>
  return <PageShell>{session ? <Queue /> : <Login onLogin={() => supabase.auth.getSession().then(({ data }) => setSession(data.session))} />}</PageShell>
}
