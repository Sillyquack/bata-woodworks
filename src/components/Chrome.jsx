import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'

const homeLinks = [
  ['Work', '#work'],
  ['Custom', '#custom'],
  ['About', '#about'],
  ['Available', '#available'],
  ['Request', '#request'],
]

export function Header({ compact = false }) {
  const [open, setOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const panelRef = useRef(null)
  const links = compact ? [['Home', `${import.meta.env.BASE_URL}`]] : homeLinks

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    const handleKeyboard = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        requestAnimationFrame(() => menuButtonRef.current?.focus())
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...panelRef.current.querySelectorAll('button, a[href]')]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    window.addEventListener('keydown', handleKeyboard)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyboard)
    }
  }, [open])

  return (
    <header className="site-header">
      <a className="brand" href={compact ? import.meta.env.BASE_URL : '#top'} aria-label="Bata Woodworks home">
        <span className="brand-mark">BW</span>
        <span>
          <strong>Bata Woodworks</strong>
          <small>Reclaimed custom pieces</small>
        </span>
      </a>
      <nav className="desktop-nav" aria-label="Main navigation">
        {links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      {!compact && <a className="header-cta" href="#request">Request a piece</a>}
      <button ref={menuButtonRef} className="menu-button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="mobile-navigation">
        <Menu size={22} />
      </button>
      {open && (
        <div ref={panelRef} className="mobile-panel" id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button ref={closeButtonRef} className="close-button" onClick={() => { setOpen(false); menuButtonRef.current?.focus() }} aria-label="Close menu"><X size={24} /></button>
          {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
          {!compact && <a className="mobile-cta" href="#request" onClick={() => setOpen(false)}>Request a piece</a>}
        </div>
      )}
    </header>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div>
        <strong>Bata Woodworks</strong>
        <p>Custom woodwork from reclaimed materials.</p>
      </div>
      <nav className="footer-links" aria-label="Legal and internal links">
        <a href="#/privacy">Privacy</a>
        <a href="#/terms">Terms</a>
        <a href="#/admin">Manager</a>
        <a href="#top">Back to top</a>
      </nav>
    </footer>
  )
}

export function PageShell({ children }) {
  return <><Header compact /><main className="app-page">{children}</main><Footer /></>
}
