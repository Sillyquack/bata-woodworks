import { isRequestIntakeOpen } from "./intake.ts";

Deno.test("request intake fails closed and opens only on an explicit true value", () => {
  if (isRequestIntakeOpen(undefined)) {
    throw new Error("missing configuration must pause intake");
  }
  if (!isRequestIntakeOpen("true")) throw new Error("true must open intake");
  if (isRequestIntakeOpen(" FALSE ")) {
    throw new Error("false must pause intake");
  }
});
