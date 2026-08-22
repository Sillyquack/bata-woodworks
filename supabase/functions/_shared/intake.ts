export const INTAKE_PAUSED_MESSAGE =
  "New custom requests are temporarily paused while current work is completed.";

export function isRequestIntakeOpen(value: string | undefined) {
  return String(value ?? "false").trim().toLowerCase() === "true";
}
