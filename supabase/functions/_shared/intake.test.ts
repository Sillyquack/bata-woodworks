import { isRequestIntakeOpen } from "./intake.ts";

Deno.test("request intake is open by default and pauses only on an explicit false value", () => {
  if (!isRequestIntakeOpen(undefined)) {
    throw new Error("missing configuration must preserve existing intake");
  }
  if (!isRequestIntakeOpen("true")) throw new Error("true must open intake");
  if (isRequestIntakeOpen(" FALSE ")) {
    throw new Error("false must pause intake");
  }
});
