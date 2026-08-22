import { isNonProductionEnvironment, legalTradingEnabled } from "./identity.ts";

Deno.test("mock-capable environments are an explicit local or test allowlist", () => {
  if (!isNonProductionEnvironment("local")) {
    throw new Error("local must be allowed");
  }
  if (!isNonProductionEnvironment("test")) {
    throw new Error("test must be allowed");
  }
  if (isNonProductionEnvironment("production")) {
    throw new Error("production must be rejected");
  }
  if (isNonProductionEnvironment("")) {
    throw new Error("missing APP_ENV must fail closed");
  }
});

Deno.test("legal trading opens only on the exact true value", () => {
  if (!legalTradingEnabled("true")) {
    throw new Error("true must open the legal gate");
  }
  if (legalTradingEnabled("TRUE")) {
    throw new Error("non-exact values must remain closed");
  }
  if (legalTradingEnabled("")) {
    throw new Error("missing legal approval must fail closed");
  }
});
