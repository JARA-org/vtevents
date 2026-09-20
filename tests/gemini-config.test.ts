import test from "node:test";
import assert from "node:assert/strict";
import { enableFreeTierAssistant } from "../deploy/lib/gemini-config.mjs";

test("activation changes only the free-tier flag and preserves literal credentials", () => {
  for (const newline of ["\n", "\r\n"]) {
    const prefix = ["OTHER=literal-$VALUE#keep", "GEMINI_API_KEY=synthetic-$key#raw", "GEMINI_MODEL=gemini-3.5-flash-lite"].join(newline) + newline;
    assert.equal(enableFreeTierAssistant(prefix + "GEMINI_FREE_TIER_CONFIRMED=false" + newline), prefix + "GEMINI_FREE_TIER_CONFIRMED=true" + newline);
    const enabled = enableFreeTierAssistant(prefix);
    assert.equal(enableFreeTierAssistant(enabled), enabled);
    assert.ok(enabled.startsWith(prefix));
  }
});
test("activation fails without a key or with ambiguous or unsupported configuration", () => {
  for (const value of ["", "GEMINI_API_KEY=", "GEMINI_API_KEY=YOUR_KEY", "GEMINI_API_KEY=synthetic\nGEMINI_MODEL=paid-model", "GEMINI_API_KEY=synthetic\nGEMINI_API_KEY=other", "GEMINI_API_KEY=synthetic\nGEMINI_FREE_TIER_CONFIRMED=false\nGEMINI_FREE_TIER_CONFIRMED=true"]) {
    assert.throws(() => enableFreeTierAssistant(value));
  }
});
