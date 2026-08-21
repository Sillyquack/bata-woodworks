import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const privacyVersion = import.meta.env.VITE_PRIVACY_VERSION ?? ''
export const backendConfigured = Boolean(supabaseUrl && publishableKey && privacyVersion && privacyVersion !== 'needs_owner')

export const supabase = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  : null

async function publicFunction(name, { body, headers = {} } = {}) {
  if (!supabaseUrl || !publishableKey) throw new Error('The online service is not configured.')
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      ...headers,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || 'The request could not be completed.')
  return payload
}

export function submitRequest(formData, idempotencyKey) {
  return publicFunction('submit-request', {
    body: formData,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export function loadOffer(token) {
  return publicFunction('offer', { body: { token } })
}

export function startPayment(token, termsVersion, method) {
  return publicFunction('create-payment', { body: { token, termsVersion, method } })
}

export async function adminAction(body) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('admin-api', { body })
  if (error) {
    const context = await error.context?.json?.().catch(() => null)
    throw new Error(context?.message || error.message)
  }
  return data
}
export async function uploadOfferAsset(offerId, file) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const body = new FormData()
  body.set('action', 'upload_offer_asset')
  body.set('offerId', offerId)
  body.set('file', file)
  const { data, error } = await supabase.functions.invoke('admin-api', { body })
  if (error) {
    const context = await error.context?.json?.().catch(() => null)
    throw new Error(context?.message || error.message)
  }
  return data
}
