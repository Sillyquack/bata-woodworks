import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatMoney, minorToNok, nokToMinor } from '../src/lib/format.js'
import { intakePausedMessage, isRequestIntakeOpen } from '../src/lib/intake.js'
import { parseHashRoute } from '../src/lib/route.js'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('offer tokens stay in hash routing and are decoded', () => {
  const route = parseHashRoute('#/offer/abc_DEF-123?payment=returned')
  assert.equal(route.name, 'offer')
  assert.equal(route.token, 'abc_DEF-123')
  assert.equal(route.query.get('payment'), 'returned')
})

test('unknown and malformed routes return a real not-found page', () => {
  assert.equal(parseHashRoute('#/something-else').name, 'notFound')
  assert.equal(parseHashRoute('#/%E0%A4%A').name, 'notFound')
  assert.equal(parseHashRoute('').name, 'home')
  assert.equal(parseHashRoute('#work').name, 'home')
  assert.equal(parseHashRoute('#request').name, 'home')
  assert.equal(parseHashRoute('#/payment-return?reference=BW-12345678').name, 'paymentReturn')
})

test('NOK amounts convert to server minor units without floating input ambiguity', () => {
  assert.equal(nokToMinor('123,45'), 12345)
  assert.equal(nokToMinor('123.4'), 12340)
  assert.equal(nokToMinor('12.345'), null)
  assert.equal(nokToMinor('-1'), null)
  assert.equal(minorToNok(12345), '123.45')
  assert.match(formatMoney(12345, 'NOK'), /123/)
})

test('request timing is presented only as a non-binding preference', () => {
  const home = source('src/pages/HomePage.jsx')
  const legal = source('src/pages/LegalPage.jsx')
  assert.match(home, /Preferred timing — not a deadline/)
  assert.match(home, /Preferred date — optional, not guaranteed/)
  assert.match(home, /helps us assess fit only\. It does not create a deadline or production commitment/)
  assert.match(legal, /preferred timing or date supplied with an inquiry is informational and non-binding/)
})

test('paused intake disables submission while the portfolio and private routes remain available', () => {
  assert.equal(isRequestIntakeOpen('false'), false)
  assert.equal(isRequestIntakeOpen(' FALSE '), false)
  assert.equal(isRequestIntakeOpen('true'), true)
  assert.equal(isRequestIntakeOpen(undefined), false)
  assert.match(intakePausedMessage, /temporarily paused/)

  const home = source('src/pages/HomePage.jsx')
  const main = source('src/main.jsx')
  assert.match(home, /fieldset className="request-fields" disabled={!requestIntakeOpen \|\| !backendConfigured}/)
  assert.match(home, /<WorkGallery \/><CustomProcess \/><About \/><AvailablePieces \/><RequestForm \/>/)
  assert.match(main, /route\.name === 'offer'/)
})

test('showroom-only production builds reject every backend path', () => {
  const backend = source('src/lib/backend.js')
  const validator = source('scripts/check-production-config.mjs')
  const workflow = source('.github/workflows/deploy.yml')

  assert.match(backend, /backendConfigured = !showroomOnly/)
  assert.match(backend, /if \(showroomOnly\) throw new Error\('This showroom does not accept online requests or payments\.'\)/)
  assert.match(validator, /Supabase and privacy variables must be unset for a backend-free showroom deployment/)
  assert.match(validator, /exact\('PAYMENT_PROVIDER', 'disabled'\)/)
  assert.match(validator, /exact\('ALLOW_MOCK_PAYMENTS', 'false'\)/)
  assert.match(workflow, /VITE_SHOWROOM_ONLY: \$\{\{ vars\.VITE_SHOWROOM_ONLY \}\}/)
})

test('offer and manager screens use the agreed Bata-approved production period', () => {
  const admin = source('src/pages/AdminPage.jsx')
  const offer = source('src/pages/OfferPage.jsx')
  assert.match(admin, /Bata-approved production period/)
  assert.match(admin, /Bata has approved this project and production period/)
  assert.match(admin, /disabled={busy \|\| !confirmed}/)
  assert.match(offer, /<dt>Agreed production period<\/dt>/)
  assert.match(offer, /fixed delivery date applies only when expressly stated in the offer/)
  assert.match(offer, /exact scope, total, agreed production period and terms version/)
})

test('production identity, metadata and payment return stay fail-closed', () => {
  const identity = source('src/config/identity.js')
  const index = source('index.html')
  const createPayment = source('supabase/functions/create-payment/index.ts')
  const offerFunction = source('supabase/functions/offer/index.ts')
  const webhook = source('supabase/functions/payment-webhook/index.ts')

  assert.match(identity, /https:\/\/batawoodworks\.no/)
  assert.match(identity, /hello@batawoodworks\.no/)
  assert.match(identity, /orders@batawoodworks\.no/)
  assert.match(index, /rel="canonical" href="https:\/\/batawoodworks\.no"/)
  assert.match(index, /property="og:url" content="https:\/\/batawoodworks\.no"/)
  assert.match(createPayment, /#\/payment-return\?reference=/)
  assert.doesNotMatch(createPayment, /#\/offer\/\$\{encodeURIComponent\(token\)\}/)
  assert.match(createPayment, /legalTradingEnabled\(\)/)
  assert.match(createPayment, /isNonProductionEnvironment\(\)/)
  assert.match(offerFunction, /VIPPS_LIVE_ENABLED/)
  assert.match(webhook, /isNonProductionEnvironment\(\)/)
})

test('Cloudflare Web Analytics stays installed with the minimum CSP allowances', () => {
  const index = source('index.html')
  assert.match(index, /https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js/)
  assert.match(index, /3100ccb34bf248e5ba722e888312d264/)
  assert.match(index, /script-src 'self' https:\/\/static\.cloudflareinsights\.com/)
  assert.match(index, /connect-src 'self' https:\/\/cloudflareinsights\.com/)
})
