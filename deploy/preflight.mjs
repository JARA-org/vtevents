import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkProductionConfig } from "./lib/config.mjs";

// Operator CLI: reads only the production env file; no network, writes or provisioning.
// Exit 1 on invalid/unreadable configuration; retry freely after correction. No transaction.
const path = fileURLToPath(new URL("../.env.production", import.meta.url));
try {
  const info = statSync(path);
  const { errors } = checkProductionConfig(
    readFileSync(path, "utf8"),
    process.env.GOBBLER_DOMAIN,
  );
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    errors.push(
      ".env.production: must be a regular file readable only by its owner (chmod 600).",
    );
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Production configuration passed. Values were not printed.");
    console.log(
      "This does not verify Vultr billing approval, DNS, Atlas access, credentials or provider quotas.",
    );
  }
} catch {
  console.error(
    "Cannot read .env.production. Create it from deploy/production.env.example with mode 600.",
  );
  process.exitCode = 1;
}
