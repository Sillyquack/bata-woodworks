const storagePrefix = 'bata:payment-return:'

export function paymentReturnStorageKey(reference) {
  return `${storagePrefix}${reference}`
}

export function rememberPaymentReturn(reference, offerToken) {
  if (!reference || !offerToken) return
  try {
    window.sessionStorage.setItem(paymentReturnStorageKey(reference), offerToken)
  } catch {
    // The provider flow can continue; the return page will ask the customer to
    // reopen the private email if browser storage is unavailable.
  }
}

export function takePaymentReturn(reference) {
  if (!reference) return null
  const key = paymentReturnStorageKey(reference)
  try {
    const token = window.sessionStorage.getItem(key)
    window.sessionStorage.removeItem(key)
    return token
  } catch {
    return null
  }
}
