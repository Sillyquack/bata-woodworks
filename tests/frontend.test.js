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

test('unknown routes return the public home page', () => {
  assert.equal(parseHashRoute('#/something-else').name, 'home')
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
  assert.equal(isRequestIntakeOpen(undefined), true)
  assert.match(intakePausedMessage, /temporarily paused/)

  const home = source('src/pages/HomePage.jsx')
  const main = source('src/main.jsx')
  assert.match(home, /fieldset className="request-fields" disabled={!requestIntakeOpen}/)
  assert.match(home, /<WorkGallery \/><CustomProcess \/><About \/><AvailablePieces \/><RequestForm \/>/)
  assert.match(main, /route\.name === 'offer'/)
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
