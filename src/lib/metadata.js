import { publicIdentity } from '../config/identity'

const defaultDescription = 'Bata Woodworks creates selected custom wood pieces from reclaimed materials.'

const routeMetadata = {
  home: {
    title: 'Bata Woodworks | Selected custom woodwork',
    description: defaultDescription,
    robots: 'index, follow',
  },
  privacy: {
    title: 'Privacy notice — launch draft | Bata Woodworks',
    description: 'Launch-gated privacy information for Bata Woodworks.',
    robots: 'noindex, nofollow',
  },
  terms: {
    title: 'Purchase terms — launch draft | Bata Woodworks',
    description: 'Launch-gated custom-order terms for Bata Woodworks.',
    robots: 'noindex, nofollow',
  },
  admin: {
    title: 'Manager access | Bata Woodworks',
    description: 'Restricted Bata Woodworks manager access.',
    robots: 'noindex, nofollow',
  },
  offer: {
    title: 'Private offer | Bata Woodworks',
    description: 'Protected Bata Woodworks offer.',
    robots: 'noindex, nofollow',
  },
  paymentReturn: {
    title: 'Checking payment | Bata Woodworks',
    description: 'Secure payment return for a private Bata Woodworks offer.',
    robots: 'noindex, nofollow',
  },
  notFound: {
    title: 'Page not found | Bata Woodworks',
    description: 'The requested Bata Woodworks page could not be found.',
    robots: 'noindex, nofollow',
  },
}

function setMeta(name, content) {
  const node = document.querySelector(`meta[name="${name}"]`)
  if (node) node.setAttribute('content', content)
}

function setPropertyMeta(property, content) {
  const node = document.querySelector(`meta[property="${property}"]`)
  if (node) node.setAttribute('content', content)
}

export function applyRouteMetadata(routeName) {
  const metadata = routeMetadata[routeName] ?? routeMetadata.notFound
  document.title = metadata.title
  setMeta('description', metadata.description)
  setMeta('robots', metadata.robots)
  setPropertyMeta('og:title', metadata.title)
  setPropertyMeta('og:description', metadata.description)

  const canonical = document.querySelector('link[rel="canonical"]')
  if (canonical) canonical.setAttribute('href', publicIdentity.canonicalOrigin)
}
