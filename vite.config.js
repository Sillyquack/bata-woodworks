import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    command === 'serve' && {
      name: 'development-csp',
      transformIndexHtml(html) {
        // Vite injects CSS as inline styles while serving; the production build
        // keeps the stricter static CSP from index.html unchanged.
        return html
          .replace("style-src 'self';", "style-src 'self' 'unsafe-inline';")
          .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:56321")
      },
    },
  ].filter(Boolean),
  base: '/bata-woodworks/',
}))
