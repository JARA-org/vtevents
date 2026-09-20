import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Operator-confirmed free-tier activation only. Preserves all other raw env bytes.
 * Pure validation/transformation; never verifies billing or invokes a model. */
export function enableFreeTierAssistant(raw) {
  const lines = raw.split("\n");
  const values = new Map();
  for (const line of lines) {
    const match = /^(GEMINI_API_KEY|GEMINI_MODEL|GEMINI_FREE_TIER_CONFIRMED)=(.*)\r?$/.exec(line);
    if (!match) continue;
    if (values.has(match[1])) throw new Error("Duplicate Gemini configuration; no changes made.");
    values.set(match[1], match[2].replace(/\r$/, ""));
  }
  const key = values.get("GEMINI_API_KEY");
  if (!key || /^(YOUR_|REPLACE|CHANGEME)/i.test(key)) throw new Error("Production Gemini key is missing; no changes made.");
  const model = values.get("GEMINI_MODEL");
  if (model && model !== "gemini-3.5-flash-lite") throw new Error("Unsupported assistant model; no changes made.");
  if (values.has("GEMINI_FREE_TIER_CONFIRMED")) {
    return raw.replace(/^GEMINI_FREE_TIER_CONFIRMED=[^\r\n]*/m, "GEMINI_FREE_TIER_CONFIRMED=true");
  }
  return raw + (raw.endsWith("\n") ? "" : "\n") + "GEMINI_FREE_TIER_CONFIRMED=true\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  if (path !== "/release/.env.production") throw new Error("Unexpected environment path.");
  const result = enableFreeTierAssistant(readFileSync(path, "utf8"));
  writeFileSync(path + ".assistant-next", result, { mode: 0o600, flag: "wx" });
  renameSync(path + ".assistant-next", path);
  console.log("Free-tier assistant configuration enabled; credential values withheld.");
}
