import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney, minorToNok, nokToMinor } from '../src/lib/format.js'
import { parseHashRoute } from '../src/lib/route.js'

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
