import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.TEST_SUPABASE_URL
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY
const mockSecret = process.env.TEST_MOCK_PAYMENT_SECRET
const cronSecret = process.env.TEST_CRON_SECRET
const integration = url && publishableKey && secretKey && mockSecret && cronSecret ? test : test.skip

function pngFile(name = 'reference.png') {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  return new File([bytes], name, { type: 'image/png' })
}

async function publicFunction(name, body, headers = {}) {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: publishableKey, ...headers, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
  return { response, payload: await response.json().catch(() => ({})) }
}

integration('request → offer → mock payment → production flow is server-authoritative', async () => {
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const managerEmail = `manager-${randomUUID()}@example.test`
  const outsiderEmail = `outsider-${randomUUID()}@example.test`
  const password = 'Local-test-Password-123!'
  const createdUsers = []

  const managerResult = await admin.auth.admin.createUser({
    email: managerEmail, password, email_confirm: true, app_metadata: { role: 'manager' },
  })
  assert.ifError(managerResult.error)
  createdUsers.push(managerResult.data.user.id)
  const outsiderResult = await admin.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true })
  assert.ifError(outsiderResult.error)
  createdUsers.push(outsiderResult.data.user.id)

  try {
    const submissionKey = randomUUID()
    const form = new FormData()
    form.set('name', 'Integration Customer')
    form.set('email', 'customer@example.test')
    form.set('location', 'Oslo')
    form.set('requestType', 'Custom furniture')
    form.set('description', 'A custom reclaimed oak bench for daily use in an entrance hall.')
    form.set('dimensions', '120 × 40 × 45 cm')
    form.set('intendedUse', 'Daily seating and shoe storage')
    form.set('budget', '10,000–25,000 NOK')
    form.set('timeline', 'Within 3–6 months')
    form.set('privacyAccepted', 'true')
    form.set('privacyVersion', 'test-v1')
    form.append('attachments', pngFile())

    const submitted = await publicFunction('submit-request', form, {
      Origin: 'http://127.0.0.1:5173',
      'Idempotency-Key': submissionKey,
    })
    assert.equal(submitted.response.status, 201, JSON.stringify(submitted.payload))
    assert.match(submitted.payload.reference, /^BW-[A-Z0-9]{10}$/)

    const duplicateForm = new FormData()
    for (const [key, value] of form.entries()) duplicateForm.append(key, value)
    const duplicate = await publicFunction('submit-request', duplicateForm, {
      Origin: 'http://127.0.0.1:5173',
      'Idempotency-Key': submissionKey,
    })
    assert.equal(duplicate.response.status, 200)
    assert.equal(duplicate.payload.duplicate, true)
    assert.equal(duplicate.payload.reference, submitted.payload.reference)

    const invalidFiles = new FormData()
    for (const [key, value] of form.entries()) if (key !== 'attachments') invalidFiles.append(key, value)
    invalidFiles.append('attachments', new File(['<svg></svg>'], 'unsafe.svg', { type: 'image/svg+xml' }))
    const invalidFile = await publicFunction('submit-request', invalidFiles, {
      Origin: 'http://127.0.0.1:5173', 'Idempotency-Key': randomUUID(),
    })
    assert.equal(invalidFile.response.status, 400)
    assert.equal(invalidFile.payload.error, 'invalid_attachment_type')

    const { data: request, error: requestError } = await admin.from('requests')
      .select('id, status, public_reference, request_attachments(id, object_path)')
      .eq('submission_key', submissionKey).single()
    assert.ifError(requestError)
    assert.equal(request.status, 'NEW')
    assert.equal(request.request_attachments.length, 1)

    const anonymous = createClient(url, publishableKey, { auth: { persistSession: false } })
    const anonymousRead = await anonymous.from('requests').select('id')
    assert.ok(anonymousRead.error, 'anonymous browser key must not read customer requests')
    const storageResponse = await fetch(`${url}/storage/v1/object/request-attachments/${request.request_attachments[0].object_path}`, {
      headers: { apikey: publishableKey },
    })
    assert.notEqual(storageResponse.status, 200, 'private attachment must not download anonymously')

    const outsider = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
    assert.ifError((await outsider.auth.signInWithPassword({ email: outsiderEmail, password })).error)
    const outsiderAdmin = await outsider.functions.invoke('admin-api', { body: { action: 'list' } })
    assert.ok(outsiderAdmin.error, 'authenticated non-manager must be rejected')

    const manager = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
    assert.ifError((await manager.auth.signInWithPassword({ email: managerEmail, password })).error)
    const invoke = async (body) => {
      const { data, error } = await manager.functions.invoke('admin-api', { body })
      assert.ifError(error)
      return data
    }
    const initialQueue = await invoke({ action: 'list' })
    assert.ok(initialQueue.requests.some((item) => item.id === request.id))
    await invoke({ action: 'set_request', requestId: request.id, status: 'REVIEW', internalNotes: 'Qualified locally.' })
    await invoke({ action: 'set_request', requestId: request.id, status: 'DESIGN', internalNotes: 'Drawing prepared.' })
    const saved = await invoke({
      action: 'save_offer', requestId: request.id,
      projectTitle: 'Reclaimed oak entrance bench',
      specification: 'One custom bench built to the accepted 120 × 40 × 45 cm specification.',
      materialsFinish: 'Reclaimed oak with owner-approved hardwax oil finish.',
      priceMinor: 12345, deliveryChargeMinor: 500,
      vatTreatment: 'Test VAT wording — not for production',
      deliveryTerms: 'Pickup from the owner-approved location by appointment.',
      productionWindow: 'Four to six weeks after verified payment.',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      termsVersion: 'test-terms-v1',
      termsSnapshot: 'Test-only commercial terms. Not approved or intended for a live customer order.',
    })
    const uploadBody = new FormData()
    uploadBody.set('action', 'upload_offer_asset')
    uploadBody.set('offerId', saved.offer.id)
    uploadBody.set('file', pngFile('drawing.png'))
    const uploadResult = await manager.functions.invoke('admin-api', { body: uploadBody })
    assert.ifError(uploadResult.error)
    const sent = await invoke({ action: 'send_offer', offerId: saved.offer.id })
    assert.equal(sent.issued, true)
    assert.equal(sent.emailSent, true)
    assert.ok(sent.previewUrl)
    const token = decodeURIComponent(sent.previewUrl.split('/#/offer/')[1])

    const customerOffer = await publicFunction('offer', { token }, { Origin: 'http://127.0.0.1:5173' })
    assert.equal(customerOffer.response.status, 200, JSON.stringify(customerOffer.payload))
    assert.equal(customerOffer.payload.totalMinor, 12845)
    assert.equal(customerOffer.payload.paymentMethods[0], 'MOCK')
    assert.equal(customerOffer.payload.attachments.length, 1)

    const checkout = await publicFunction('create-payment', {
      token, termsVersion: 'test-terms-v1', method: 'MOCK', amountMinor: 1,
    }, { Origin: 'http://127.0.0.1:5173' })
    assert.equal(checkout.response.status, 201, JSON.stringify(checkout.payload))
    const providerReference = checkout.payload.providerReference
    const { data: pendingPayment } = await admin.from('payments').select('id, amount_minor, status').eq('provider_reference', providerReference).single()
    assert.equal(pendingPayment.amount_minor, 12845, 'client-supplied amount must be ignored')
    assert.equal(pendingPayment.status, 'PENDING')
    assert.equal((await admin.from('requests').select('status').eq('id', request.id).single()).data.status, 'OFFER_SENT', 'redirect/create alone must not mark paid')

    const wrongSecret = await publicFunction('payment-webhook', {
      eventId: randomUUID(), reference: providerReference, name: 'CAPTURED',
      amount: { value: 12845, currency: 'NOK' }, success: true,
    }, { 'x-bata-mock-secret': 'wrong-secret' })
    assert.equal(wrongSecret.response.status, 401)

    const tampered = await publicFunction('payment-webhook', {
      eventId: randomUUID(), reference: providerReference, name: 'CAPTURED',
      amount: { value: 1, currency: 'NOK' }, success: true,
    }, { 'x-bata-mock-secret': mockSecret })
    assert.equal(tampered.response.status, 409)
    assert.equal((await admin.from('payments').select('status').eq('id', pendingPayment.id).single()).data.status, 'PENDING')

    const aborted = await publicFunction('payment-webhook', {
      eventId: randomUUID(), reference: providerReference, name: 'ABORTED',
      amount: { value: 12845, currency: 'NOK' }, success: true,
      occurredAt: new Date().toISOString(),
    }, { 'x-bata-mock-secret': mockSecret })
    assert.equal(aborted.response.status, 200, JSON.stringify(aborted.payload))
    assert.equal((await admin.from('payments').select('status').eq('id', pendingPayment.id).single()).data.status, 'CANCELLED')
    assert.equal((await admin.from('offers').select('status').eq('id', saved.offer.id).single()).data.status, 'SENT', 'aborting checkout must leave the offer payable')
    assert.equal((await admin.from('requests').select('status').eq('id', request.id).single()).data.status, 'OFFER_SENT', 'aborting checkout must not cancel the request')

    const retryCheckout = await publicFunction('create-payment', {
      token, termsVersion: 'test-terms-v1', method: 'MOCK',
    }, { Origin: 'http://127.0.0.1:5173' })
    assert.equal(retryCheckout.response.status, 201, JSON.stringify(retryCheckout.payload))
    assert.notEqual(retryCheckout.payload.providerReference, providerReference)
    const retryReference = retryCheckout.payload.providerReference
    const { data: retryPayment } = await admin.from('payments')
      .select('id, amount_minor, status').eq('provider_reference', retryReference).single()
    assert.equal(retryPayment.status, 'PENDING')

    const eventId = randomUUID()
    const capturedBody = {
      eventId, reference: retryReference, name: 'CAPTURED',
      amount: { value: 12845, currency: 'NOK' }, success: true,
      occurredAt: new Date().toISOString(),
    }
    const captured = await publicFunction('payment-webhook', capturedBody, { 'x-bata-mock-secret': mockSecret })
    assert.equal(captured.response.status, 200, JSON.stringify(captured.payload))
    assert.equal((await admin.from('payments').select('status').eq('id', retryPayment.id).single()).data.status, 'CAPTURED')
    assert.equal((await admin.from('requests').select('status').eq('id', request.id).single()).data.status, 'PAID')
    const replay = await publicFunction('payment-webhook', capturedBody, { 'x-bata-mock-secret': mockSecret })
    assert.equal(replay.response.status, 200)
    assert.equal(replay.payload.replay, true)

    const paidOffer = await publicFunction('offer', { token }, { Origin: 'http://127.0.0.1:5173' })
    assert.equal(paidOffer.payload.status, 'PAID')
    assert.equal(paidOffer.payload.payable, false)
    await invoke({ action: 'set_request', requestId: request.id, status: 'PRODUCTION', internalNotes: 'Started.' })
    const ready = await invoke({ action: 'set_request', requestId: request.id, status: 'READY', internalNotes: 'Finished.', readyInstructions: 'Collect by appointment.' })
    assert.equal(ready.notificationSent, true)

    const expiryRequestId = randomUUID()
    const expiryOfferId = randomUUID()
    const expiryToken = `expiry-${randomUUID()}-${randomUUID()}`
    assert.ifError((await admin.from('requests').insert({
      id: expiryRequestId, public_reference: `BW-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
      submission_key: randomUUID(), customer_name: 'Expiry Test', email: 'expiry@example.test', location: 'Oslo',
      request_type: 'Home object', project_description: 'A detailed request created for scheduled expiry testing.',
      privacy_version: 'test-v1', consent_accepted_at: new Date().toISOString(), consent_ip_hash: 'e'.repeat(64), status: 'OFFER_SENT',
    })).error)
    assert.ifError((await admin.from('offers').insert({
      id: expiryOfferId, request_id: expiryRequestId, version: 1, status: 'SENT', project_title: 'Expiry test',
      specification: 'Exact test specification for a deliberately expired private offer.', materials_finish: 'Test finish',
      price_minor: 1000, delivery_charge_minor: 0, vat_treatment: 'Test VAT', delivery_terms: 'Test pickup',
      production_window: 'Test window', expires_at: new Date(Date.now() - 60000).toISOString(),
      terms_version: 'test-v1', terms_snapshot: 'Test terms snapshot long enough for the constraint.',
      issued_at: new Date(Date.now() - 120000).toISOString(), public_token_hash: createHash('sha256').update(expiryToken).digest('hex'),
    })).error)
    const expiryPaymentId = randomUUID()
    const expiryReference = `BW-LATE-${randomUUID()}`
    assert.ifError((await admin.from('payments').insert({
      id: expiryPaymentId, offer_id: expiryOfferId, offer_version: 1, provider: 'mock', payment_method: 'MOCK',
      provider_reference: expiryReference, idempotency_key: randomUUID(), status: 'PENDING', amount_minor: 1000,
      currency: 'NOK', terms_version: 'test-v1', terms_accepted_at: new Date(Date.now() - 120000).toISOString(),
    })).error)
    const expired = await publicFunction('expire-offers', {}, { 'x-bata-cron-secret': cronSecret })
    assert.equal(expired.response.status, 200, JSON.stringify(expired.payload))
    assert.ok(expired.payload.expired >= 1)
    assert.equal((await admin.from('requests').select('status').eq('id', expiryRequestId).single()).data.status, 'EXPIRED')

    const lateAuthorization = await publicFunction('payment-webhook', {
      eventId: randomUUID(), reference: expiryReference, name: 'AUTHORIZED',
      amount: { value: 1000, currency: 'NOK' }, success: true,
      occurredAt: new Date().toISOString(),
    }, { 'x-bata-mock-secret': mockSecret })
    assert.equal(lateAuthorization.response.status, 409)
    assert.equal((await admin.from('payments').select('status').eq('id', expiryPaymentId).single()).data.status, 'EXPIRED')

    const lateCapture = await publicFunction('payment-webhook', {
      eventId: randomUUID(), reference: expiryReference, name: 'CAPTURED',
      amount: { value: 1000, currency: 'NOK' }, success: true,
      occurredAt: new Date().toISOString(),
    }, { 'x-bata-mock-secret': mockSecret })
    assert.equal(lateCapture.response.status, 409)
    assert.equal((await admin.from('offers').select('status').eq('id', expiryOfferId).single()).data.status, 'EXPIRED')
    assert.equal((await admin.from('requests').select('status').eq('id', expiryRequestId).single()).data.status, 'EXPIRED')

    const reconciliation = await publicFunction('reconcile-payments', {}, { 'x-bata-cron-secret': cronSecret })
    assert.equal(reconciliation.response.status, 200, JSON.stringify(reconciliation.payload))
    assert.equal(reconciliation.payload.claimed, 0, 'local mock flow must not create stale Vipps work')
  } finally {
    for (const userId of createdUsers) await admin.auth.admin.deleteUser(userId)
  }
})
