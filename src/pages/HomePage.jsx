import { useRef, useState } from 'react'
import { ArrowRight, Hammer, Leaf, Mail, Paperclip, Sparkles } from 'lucide-react'
import { availablePieces, galleryItems, requestTypes } from '../data/content'
import { backendConfigured, privacyVersion, submitRequest } from '../lib/backend'
import { Footer, Header } from '../components/Chrome'

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow">Selected custom woodwork</p>
        <h1>Handmade pieces from wood with a past.</h1>
        <p className="hero-text">Bata Woodworks creates one-of-a-kind furniture, objects and artistic wood pieces from reclaimed materials — shaped by a lifelong carpenter with a rare eye for detail.</p>
        <div className="hero-actions">
          <a className="primary-button" href="#request">Request a custom piece <ArrowRight size={18} /></a>
          <a className="secondary-button" href="#work">View the work</a>
        </div>
      </div>
      <div className="hero-card hero-photo">
        <img src={`${import.meta.env.BASE_URL}images/hero-bata.jpg`} alt="Craftsman working with wood" />
        <div className="hero-card-label"><span>Reclaimed</span><strong>Built with intention</strong></div>
      </div>
    </section>
  )
}

function ValueStrip() {
  return (
    <section className="value-strip" aria-label="Core values">
      <div><Leaf /><h3>Reclaimed materials</h3><p>Wood that might have been discarded becomes the beginning of something lasting.</p></div>
      <div><Hammer /><h3>Lifetime craft</h3><p>Practical carpentry skill meets artistic instinct, detail and precision.</p></div>
      <div><Sparkles /><h3>Selected projects</h3><p>Every request is reviewed individually. Not everything is accepted — and that is the point.</p></div>
    </section>
  )
}

function WorkGallery() {
  return (
    <section className="section" id="work">
      <div className="section-heading">
        <p className="eyebrow">Previous work</p>
        <h2>Objects with grain, marks and memory.</h2>
        <p>A selection of furniture, functional pieces and detailed wood-burning work shaped around reclaimed material.</p>
      </div>
      <div className="gallery-grid">
        {galleryItems.map((item) => (
          <article className="gallery-card" key={item.title}>
            <div className="gallery-image"><img src={item.image} alt={item.title} /><span>{item.category}</span></div>
            <div><h3>{item.title}</h3><p>{item.description}</p></div>
          </article>
        ))}
      </div>
    </section>
  )
}

function CustomProcess() {
  const steps = [
    ['Send a structured request', 'Share the intended use, rough dimensions, location, budget, timeline and up to five reference files.'],
    ['We review the fit', 'Bata considers materials, complexity, timeline, budget and creative direction. Submission does not guarantee acceptance.'],
    ['Review one private offer', 'Selected projects receive one link with the exact scope, drawing, price, delivery terms, production window and expiry.'],
    ['Pay to start production', 'Only verified payment creates a production commitment. Automated updates follow when the piece enters production and is ready.'],
  ]
  return (
    <section className="section split" id="custom">
      <div className="sticky-copy">
        <p className="eyebrow">Custom work</p>
        <h2>Not mass produced. Not automatically accepted.</h2>
        <p>Bata takes on selected custom projects only. This keeps the work personal, protects the craft, and gives each piece the attention it deserves.</p>
        <a className="text-link" href="#request">Start a request <ArrowRight size={16} /></a>
      </div>
      <div className="process-list">
        {steps.map(([title, text], index) => (
          <div className="process-step" key={title}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{text}</p></div></div>
        ))}
      </div>
    </section>
  )
}

function About() {
  return (
    <section className="about-section" id="about">
      <div className="about-image"><img src={`${import.meta.env.BASE_URL}images/about-bata.jpg`} alt="Woodworking process" /><span>Bata at work</span></div>
      <div className="about-copy">
        <p className="eyebrow">About the maker</p>
        <h2>A carpenter who sees possibility where others see waste.</h2>
        <p>Bata has spent a lifetime working with wood. Fast, precise and endlessly creative, he has the kind of practical imagination that can turn rough timber into something that feels like it was always meant to exist.</p>
        <p>His personal work begins with discarded timber, leftover materials and wood that still has life in it. Many pieces include hand-burned patterns and surface details, making each one unique.</p>
      </div>
    </section>
  )
}

function AvailablePieces() {
  return (
    <section className="section" id="available">
      <div className="section-heading compact">
        <p className="eyebrow">Available pieces</p>
        <h2>Small drops. Rare pieces. Made when ready.</h2>
        <p>Selected objects appear in small numbers. Ask about a piece through the same reviewed request process.</p>
      </div>
      <div className="product-grid">
        {availablePieces.map((piece) => (
          <article className="product-card" key={piece.title}>
            <div className="product-topline"><span>{piece.status}</span><small>{piece.price}</small></div>
            <h3>{piece.title}</h3><p>{piece.description}</p><a href="#request">Ask about this piece</a>
          </article>
        ))}
      </div>
    </section>
  )
}

function RequestForm() {
  const [state, setState] = useState({ phase: 'idle', message: '', reference: '' })
  const idempotencyKey = useRef(crypto.randomUUID())
  const statusRef = useRef(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!backendConfigured || state.phase === 'sending') return
    const form = event.currentTarget
    const data = new FormData(form)
    data.set('privacyAccepted', data.get('privacyAccepted') ? 'true' : 'false')
    data.set('privacyVersion', privacyVersion)
    setState({ phase: 'sending', message: 'Sending your request securely…', reference: '' })
    try {
      const result = await submitRequest(data, idempotencyKey.current)
      setState({ phase: 'success', message: 'Your request has been received.', reference: result.reference })
      form.reset()
      idempotencyKey.current = crypto.randomUUID()
    } catch (error) {
      setState({ phase: 'error', message: error.message, reference: '' })
      requestAnimationFrame(() => statusRef.current?.focus())
    }
  }

  return (
    <section className="request-section" id="request">
      <div className="request-intro">
        <p className="eyebrow">Request</p>
        <h2>Tell us what you would like made.</h2>
        <p>Give us enough detail to assess the project without a long email chain. If it is selected, you will receive one private offer with exact terms and a payment step.</p>
      </div>
      <form className="request-form" onSubmit={handleSubmit} encType="multipart/form-data">
        {!backendConfigured && (
          <div className="form-message warning-message" role="status">
            Online requests are not yet open. The owner must finish the privacy, email and backend setup before live submissions can be accepted.
          </div>
        )}
        {state.phase !== 'idle' && (
          <div
            className={`form-message ${state.phase === 'error' ? 'error-message' : 'success-message'}`}
            role={state.phase === 'error' ? 'alert' : 'status'}
            tabIndex={state.phase === 'error' ? -1 : undefined}
            ref={statusRef}
          >
            {state.message} {state.reference && <><br />Reference: <strong>{state.reference}</strong>. Keep this for your records.</>}
          </div>
        )}
        <div className="form-row">
          <label>Name<input name="name" autoComplete="name" type="text" required minLength="2" maxLength="160" /></label>
          <label>Email<input name="email" autoComplete="email" type="email" required maxLength="320" /></label>
        </div>
        <div className="form-row">
          <label>Phone <span className="optional">Optional</span><input name="phone" autoComplete="tel" type="tel" maxLength="40" /></label>
          <label>Location / delivery area<input name="location" autoComplete="address-level2" type="text" required minLength="2" maxLength="240" placeholder="City / area" /></label>
        </div>
        <label>Request type<select name="requestType" required defaultValue=""><option value="" disabled>Choose one</option>{requestTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Project description<textarea name="description" rows="6" minLength="20" maxLength="8000" placeholder="Describe the piece, style, space, constraints and what matters most." required /></label>
        <div className="form-row">
          <label>Rough dimensions <span className="optional">Optional</span><textarea name="dimensions" rows="3" maxLength="1000" placeholder="Width × depth × height, if known" /></label>
          <label>Intended use <span className="optional">Optional</span><textarea name="intendedUse" rows="3" maxLength="2000" placeholder="How and where the piece will be used" /></label>
        </div>
        <div className="form-row">
          <label>Approx. budget<select name="budget" defaultValue=""><option value="">Not specified</option><option>Under 2,500 NOK</option><option>2,500–5,000 NOK</option><option>5,000–10,000 NOK</option><option>10,000–25,000 NOK</option><option>25,000+ NOK</option><option>Not sure yet</option></select></label>
          <label>Timeline<select name="timeline" defaultValue=""><option value="">Not specified</option><option>No rush</option><option>Within 1–2 months</option><option>Within 3–6 months</option><option>Specific date</option><option>Not sure yet</option></select></label>
        </div>
        <label>Requested date <span className="optional">Optional</span><input name="requestedDate" type="date" /></label>
        <label className="file-label">
          <span>Inspiration or reference files <span className="optional">Optional</span></span>
          <span className="file-help"><Paperclip size={16} /> Up to 5 JPEG, PNG, WebP or PDF files; 5 MB each and 15 MB total.</span>
          <input name="attachments" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
        </label>
        <label className="checkbox-label">
          <input name="privacyAccepted" type="checkbox" required />
          <span>I have read the <a href="#/privacy" target="_blank" rel="noreferrer">privacy notice</a>, consent to this request being processed, and understand that submission does not guarantee acceptance.</span>
        </label>
        <button className="primary-button submit-button" type="submit" disabled={!backendConfigured || state.phase === 'sending'}>
          {state.phase === 'sending' ? 'Sending…' : 'Submit request'} <Mail size={18} />
        </button>
      </form>
    </section>
  )
}

function CarpentryNote() {
  return <section className="carpentry-note"><div><p className="eyebrow">Selected carpentry</p><h2>Practical work, quietly available.</h2></div><p>In addition to custom pieces, Bata occasionally accepts selected carpentry assignments depending on availability and project type. Choose <strong>Selected carpentry request</strong> in the form.</p></section>
}

export default function HomePage() {
  return <><Header /><main><Hero /><ValueStrip /><WorkGallery /><CustomProcess /><About /><AvailablePieces /><RequestForm /><CarpentryNote /></main><Footer /></>
}
