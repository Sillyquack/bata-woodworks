export function formatMoney(minor, currency = 'NOK') {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency }).format(Number(minor) / 100)
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function nokToMinor(value) {
  const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const minor = Math.round(Number(normalized) * 100)
  return Number.isSafeInteger(minor) ? minor : null
}

export function minorToNok(value) {
  return (Number(value ?? 0) / 100).toFixed(2)
}
