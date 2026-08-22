export const intakePausedMessage = 'New custom requests are temporarily paused while current work is completed.'

export function isRequestIntakeOpen(value) {
  return String(value ?? 'false').trim().toLowerCase() === 'true'
}
