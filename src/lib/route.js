const homeSections = new Set(['top', 'work', 'custom', 'about', 'available', 'request'])

export function parseHashRoute(hash) {
  const raw = String(hash || '#/').replace(/^#/, '')
  const [pathname, query = ''] = raw.split('?')
  let segments
  try {
    segments = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  } catch {
    return { name: 'notFound', query: new URLSearchParams(query) }
  }
  if (segments.length === 1 && homeSections.has(segments[0])) {
    return { name: 'home', query: new URLSearchParams(query) }
  }
  if (segments.length === 0) return { name: 'home', query: new URLSearchParams(query) }
  if (segments[0] === 'offer' && segments[1]) {
    return { name: 'offer', token: segments[1], query: new URLSearchParams(query) }
  }
  if (segments[0] === 'payment-return') return { name: 'paymentReturn', query: new URLSearchParams(query) }
  if (segments[0] === 'admin') return { name: 'admin', query: new URLSearchParams(query) }
  if (segments[0] === 'privacy') return { name: 'privacy', query: new URLSearchParams(query) }
  if (segments[0] === 'terms') return { name: 'terms', query: new URLSearchParams(query) }
  return { name: 'notFound', query: new URLSearchParams(query) }
}
