import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  let supabaseOrigin = ''
  try {
    const url = new URL(env.VITE_SUPABASE_URL)
    if (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')) supabaseOrigin = url.origin
  } catch {
    // An unconfigured build remains fail-closed with same-origin networking only.
  }

  return {
    plugins: [
      react(),
      {
        name: 'environment-csp',
        transformIndexHtml(html) {
          const productionSources = supabaseOrigin
            ? {
              images: ` ${supabaseOrigin}`,
              connections: ` ${supabaseOrigin} wss://${new URL(supabaseOrigin).host}`,
            }
            : { images: '', connections: '' }
          const developmentConnections = command === 'serve'
            ? ' http://127.0.0.1:56321 http://localhost:56321'
            : ''
          const developmentImages = command === 'serve'
            ? ' http://127.0.0.1:56321 http://localhost:56321'
            : ''
          const developmentStyles = command === 'serve' ? " 'unsafe-inline'" : ''
          return html
            .replace("style-src 'self';", `style-src 'self'${developmentStyles};`)
            .replace("img-src 'self' data: blob:;", `img-src 'self' data: blob:${productionSources.images}${developmentImages};`)
            .replace("connect-src 'self';", `connect-src 'self'${productionSources.connections}${developmentConnections};`)
        },
      },
    ],
    base: '/',
  }
})
