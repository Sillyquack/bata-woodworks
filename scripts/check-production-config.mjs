const failures = []

function required(name) {
  const value = process.env[name]?.trim() ?? ''
  if (!value) failures.push(`${name} is required`)
  return value
}

function exact(name, expected) {
  const value = required(name)
  if (value && value !== expected) failures.push(`${name} must be exactly ${expected}`)
  return value
}

const showroomOnly = required('VITE_SHOWROOM_ONLY')
const intakeOpen = required('VITE_REQUEST_INTAKE_OPEN')
const legalTradingEnabled = required('LEGAL_TRADING_ENABLED')
const serverIntakeOpen = required('REQUEST_INTAKE_OPEN')
const paymentProvider = required('PAYMENT_PROVIDER')
const vippsLiveEnabled = required('VIPPS_LIVE_ENABLED')
const allowMockPayments = required('ALLOW_MOCK_PAYMENTS')
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
const privacyVersion = process.env.VITE_PRIVACY_VERSION?.trim() ?? ''

if (!['true', 'false'].includes(showroomOnly)) failures.push('VITE_SHOWROOM_ONLY must be exactly true or false')
if (!['true', 'false'].includes(intakeOpen)) failures.push('VITE_REQUEST_INTAKE_OPEN must be exactly true or false')
if (!['true', 'false'].includes(legalTradingEnabled)) failures.push('LEGAL_TRADING_ENABLED must be exactly true or false')
if (!['true', 'false'].includes(serverIntakeOpen)) failures.push('REQUEST_INTAKE_OPEN must be exactly true or false')
if (!['disabled', 'vipps'].includes(paymentProvider)) failures.push('PAYMENT_PROVIDER must be exactly disabled or vipps')
if (!['true', 'false'].includes(vippsLiveEnabled)) failures.push('VIPPS_LIVE_ENABLED must be exactly true or false')
if (!['true', 'false'].includes(allowMockPayments)) failures.push('ALLOW_MOCK_PAYMENTS must be exactly true or false')

if (showroomOnly === 'true') {
  exact('VITE_REQUEST_INTAKE_OPEN', 'false')
  exact('LEGAL_TRADING_ENABLED', 'false')
  exact('REQUEST_INTAKE_OPEN', 'false')
  exact('PAYMENT_PROVIDER', 'disabled')
  exact('VIPPS_LIVE_ENABLED', 'false')
  exact('ALLOW_MOCK_PAYMENTS', 'false')

  if (supabaseUrl || publishableKey || privacyVersion) {
    failures.push('Supabase and privacy variables must be unset for a backend-free showroom deployment')
  }
} else if (showroomOnly === 'false') {
  if (!supabaseUrl) failures.push('VITE_SUPABASE_URL is required')
  if (!publishableKey) failures.push('VITE_SUPABASE_PUBLISHABLE_KEY is required')
  if (!privacyVersion) failures.push('VITE_PRIVACY_VERSION is required')

  try {
    const url = new URL(supabaseUrl)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
      failures.push('VITE_SUPABASE_URL must be an HTTPS Supabase project URL')
    }
  } catch {
    failures.push('VITE_SUPABASE_URL must be a valid URL')
  }

  if (!publishableKey.startsWith('sb_publishable_')) {
    failures.push('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable browser key, not a secret/service-role key')
  }
  if (privacyVersion === 'needs_owner') failures.push('VITE_PRIVACY_VERSION must be owner approved')
}

if (failures.length) {
  console.error(`Production configuration is blocked:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log(showroomOnly === 'true'
  ? 'Backend-free showroom configuration passed fail-closed validation.'
  : 'Production public configuration passed fail-closed validation.')
