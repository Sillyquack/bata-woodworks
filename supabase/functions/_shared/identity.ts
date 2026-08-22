export const CANONICAL_SITE_URL = "https://batawoodworks.no";
export const PUBLIC_EMAIL = "hello@batawoodworks.no";
export const ORDERS_EMAIL = "orders@batawoodworks.no";
export const MANAGER_EMAIL = "robert@batawoodworks.no";
export const PREFERRED_EMAIL_FROM = `Bata Woodworks <${PUBLIC_EMAIL}>`;

export function isNonProductionEnvironment(value = Deno.env.get("APP_ENV")) {
  return ["local", "test"].includes(value ?? "");
}

export function legalTradingEnabled(
  value = Deno.env.get("LEGAL_TRADING_ENABLED"),
) {
  return value === "true";
}
