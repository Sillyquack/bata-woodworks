const failures = []

function required(name) {
  const value = process.env[name]?.trim() ?? ''
  if (!value) failures.push(`${name} is required`)
  return value
}

const supabaseUrl = required('VITE_SUPABASE_URL')
const publishableKey = required('VITE_SUPABASE_PUBLISHABLE_KEY')
const privacyVersion = required('VITE_PRIVACY_VERSION')
const intakeOpen = required('VITE_REQUEST_INTAKE_OPEN')

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
if (!['true', 'false'].includes(intakeOpen)) failures.push('VITE_REQUEST_INTAKE_OPEN must be exactly true or false')

if (failures.length) {
  console.error(`Production configuration is blocked:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log('Production public configuration passed fail-closed validation.')
