import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, Hammer, Leaf, Mail, Menu, Sparkles, X } from 'lucide-react'
import { availablePieces, galleryItems, requestTypes } from './data/content'
import './styles.css'

function Header() {
  const [open, setOpen] = useState(false)
  const links = [
    ['Work', '#work'],
    ['Custom', '#custom'],
    ['About', '#about'],
    ['Available', '#available'],
    ['Request', '#request'],
  ]

  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Bata Woodworks home">
        <span className="brand-mark">BW</span>
        <span>
          <strong>Bata Woodworks</strong>
          <small>Reclaimed custom pieces</small>
        </span>
      </a>

      <nav className="desktop-nav" aria-label="Main navigation">
        {links.map(([label, href]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>

      <a className="header-cta" href="#request">Request a piece</a>

      <button className="menu-button" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu size={22} />
      </button>

      {open && (
        <div className="mobile-panel">
          <button className="close-button" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={24} />
          </button>
          {links.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>
          ))}
          <a className="mobile-cta" href="#request" onClick={() => setOpen(false)}>Request a piece</a>
        </div>
      )}
    </header>
  )
}

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow">Selected custom woodwork</p>
        <h1>Handmade pieces from wood with a past.</h1>
        <p className="hero-text">
          Bata Woodworks creates one-of-a-kind furniture, objects and artistic wood pieces from reclaimed materials — shaped by a lifelong carpenter with a rare eye for detail.
        </p>
        <div className="hero-actions">
          <a className="primary-button" href="#request">Request a custom piece <ArrowRight size={18} /></a>
          <a className="secondary-button" href="#work">View the work</a>
        </div>
      </div>

      <div className="hero-card hero-photo" aria-label="Bata Woodworks preview">
<img
  src={`${import.meta.env.BASE_URL}images/hero-bata.jpg`}
  alt="Craftsman working with wood"
/>
  <div className="hero-card-label">
    <span>Reclaimed</span>
    <strong>Built with intention</strong>
  </div>
</div>
    </section>
  )
}

function ValueStrip() {
  return (
    <section className="value-strip" aria-label="Core values">
      <div>
        <Leaf />
        <h3>Reclaimed materials</h3>
        <p>Wood that might have been discarded becomes the beginning of something lasting.</p>
      </div>
      <div>
        <Hammer />
        <h3>Lifetime craft</h3>
        <p>Practical carpentry skill meets artistic instinct, detail and precision.</p>
      </div>
      <div>
        <Sparkles />
        <h3>Selected projects</h3>
        <p>Every custom request is reviewed individually. Not everything is accepted — and that is the point.</p>
      </div>
    </section>
  )
}

function WorkGallery() {
  return (
    <section className="section" id="work">
      <div className="section-heading">
        <p className="eyebrow">Previous work</p>
        <h2>Objects with grain, marks and memory.</h2>
        <p>Use this section for real photos later. For now, these cards define the premium direction and categories.</p>
      </div>
      <div className="gallery-grid">
        {galleryItems.map((item, index) => (
          <article className="gallery-card" key={item.title}>
            <div className="gallery-image">
  <img src={item.image} alt={item.title} />
  <span>{item.category}</span>
</div>
            <div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function CustomProcess() {
  const steps = [
    ['Send the idea', 'Share what you would like made, with rough dimensions, inspiration and intended use.'],
    ['We review the fit', 'Requests are considered based on materials, complexity, timeline, budget and creative direction.'],
    ['Selected projects move forward', 'If the project fits, you receive possible next steps, estimated price and timeline.'],
    ['Bata builds the piece', 'The final work is handmade, detailed and shaped around the material itself.'],
  ]

  return (
    <section className="section split" id="custom">
      <div className="sticky-copy">
        <p className="eyebrow">Custom work</p>
        <h2>Not mass produced. Not automatically accepted.</h2>
        <p>
          Bata takes on selected custom projects only. This keeps the work personal, protects the craft, and ensures each piece receives the attention it deserves.
        </p>
        <a className="text-link" href="#request">Start a request <ArrowRight size={16} /></a>
      </div>
      <div className="process-list">
        {steps.map(([title, text], index) => (
          <div className="process-step" key={title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function About() {
  return (
    <section className="about-section" id="about">
      <div className="about-image">
<img
  src={`${import.meta.env.BASE_URL}images/about-bata.jpg`}
  alt="Woodworking process"
/>
  <span>Bata at work</span>
</div>
      <div className="about-copy">
        <p className="eyebrow">About the maker</p>
        <h2>A carpenter who sees possibility where others see waste.</h2>
        <p>
          Bata has spent a lifetime working with wood. Fast, precise and endlessly creative, he has the kind of practical imagination that can turn a rough piece of timber into something that feels like it was always meant to exist.
        </p>
        <p>
          His personal work begins with discarded timber, leftover materials and pieces of wood that still have life in them. Many pieces include hand-burned patterns and surface details, making each item completely unique.
        </p>
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
        <p>Later this can become a shop. For now it works as a controlled showroom.</p>
      </div>
      <div className="product-grid">
        {availablePieces.map((piece) => (
          <article className="product-card" key={piece.title}>
            <div className="product-topline">
              <span>{piece.status}</span>
              <small>{piece.price}</small>
            </div>
            <h3>{piece.title}</h3>
            <p>{piece.description}</p>
            <a href="#request">Ask about this piece</a>
          </article>
        ))}
      </div>
    </section>
  )
}

function RequestForm() {
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    event.currentTarget.reset()
  }

  return (
    <section className="request-section" id="request">
      <div className="request-intro">
        <p className="eyebrow">Request</p>
        <h2>Tell us what you would like made.</h2>
        <p>
          This first version does not send data anywhere yet. Next step is connecting this form to Supabase and automatic email confirmation.
        </p>
      </div>

      <form className="request-form" onSubmit={handleSubmit}>
        {submitted && (
          <div className="success-message">
            Request captured in prototype mode. Next step: connect this to Supabase + email.
          </div>
        )}

        <div className="form-row">
          <label>
            Name
            <input name="name" type="text" placeholder="Your name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" placeholder="you@example.com" required />
          </label>
        </div>

        <div className="form-row">
          <label>
            Phone
            <input name="phone" type="tel" placeholder="Optional" />
          </label>
          <label>
            Location
            <input name="location" type="text" placeholder="City / area" />
          </label>
        </div>

        <label>
          Request type
          <select name="requestType" required defaultValue="">
            <option value="" disabled>Choose one</option>
            {requestTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        <label>
          Project description
          <textarea name="description" rows="6" placeholder="Describe the piece, function, style, room, measurements, ideas or inspiration." required />
        </label>

        <div className="form-row">
          <label>
            Approx. budget
            <select name="budget" defaultValue="">
              <option value="" disabled>Choose range</option>
              <option>Under 2,500 NOK</option>
              <option>2,500–5,000 NOK</option>
              <option>5,000–10,000 NOK</option>
              <option>10,000–25,000 NOK</option>
              <option>25,000+ NOK</option>
              <option>Not sure yet</option>
            </select>
          </label>
          <label>
            Timeline
            <select name="timeline" defaultValue="">
              <option value="" disabled>Choose timeline</option>
              <option>No rush</option>
              <option>Within 1–2 months</option>
              <option>Within 3–6 months</option>
              <option>Specific date</option>
              <option>Not sure yet</option>
            </select>
          </label>
        </div>

        <label className="checkbox-label">
          <input type="checkbox" required />
          <span>I understand that all requests are reviewed individually and that submitting a request does not guarantee that the project will be accepted.</span>
        </label>

        <button className="primary-button submit-button" type="submit">
          Submit request <Mail size={18} />
        </button>
      </form>
    </section>
  )
}

function CarpentryNote() {
  return (
    <section className="carpentry-note">
      <div>
        <p className="eyebrow">Selected carpentry</p>
        <h2>Practical work, quietly available.</h2>
      </div>
      <p>
        In addition to custom pieces, Bata occasionally accepts selected carpentry assignments depending on availability and project type. Use the request form and choose <strong>Selected carpentry request</strong>.
      </p>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div>
        <strong>Bata Woodworks</strong>
        <p>Custom woodwork from reclaimed materials.</p>
      </div>
      <a href="#top">Back to top</a>
    </footer>
  )
}

function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ValueStrip />
        <WorkGallery />
        <CustomProcess />
        <About />
        <AvailablePieces />
        <RequestForm />
        <CarpentryNote />
      </main>
      <Footer />
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
