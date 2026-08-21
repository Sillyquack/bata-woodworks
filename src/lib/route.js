export function parseHashRoute(hash) {
  const raw = String(hash || '#/').replace(/^#/, '')
  const [pathname, query = ''] = raw.split('?')
  const segments = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  if (segments[0] === 'offer' && segments[1]) {
    return { name: 'offer', token: segments[1], query: new URLSearchParams(query) }
  }
  if (segments[0] === 'admin') return { name: 'admin', query: new URLSearchParams(query) }
  if (segments[0] === 'privacy') return { name: 'privacy', query: new URLSearchParams(query) }
  if (segments[0] === 'terms') return { name: 'terms', query: new URLSearchParams(query) }
  return { name: 'home', query: new URLSearchParams(query) }
}
