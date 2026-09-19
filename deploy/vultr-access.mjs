import { readFileSync, statSync } from "node:fs";
import { setDefaultResultOrder } from "node:dns";
import { fileURLToPath } from "node:url";
import { checkVultrAccess } from "./lib/vultr.mjs";

// Match the administrator-approved IPv4 allowlist entry. On dual-stack hosts,
// IPv4 IP-discovery services can otherwise disagree with Node's IPv6 connection.
setDefaultResultOrder("ipv4first");

// Operator CLI: reads one owner-only key file or VULTR_API_KEY, then performs GETs.
// No credential persistence/provisioning. Exit 1 on failure; manually retry after correction.
// No automatic retry or transaction. File paths may be supplied; never pass a key as an argument.
try {
  let key = process.env.VULTR_API_KEY;
  if (process.argv[2] || !key) {
    const path =
      process.argv[2] ||
      fileURLToPath(new URL("../work/vultr-api-key", import.meta.url));
    const info = statSync(path);
    if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error();
    key = readFileSync(path, "utf8").trim();
  }
  const checks = await checkVultrAccess(key);
  console.log(JSON.stringify({ checks }, null, 2));
  console.log(
    "Read-only check. No resources created; balance is not proof of a spending cap or free-compute approval.",
  );
  process.exitCode = checks.every((check) => check.ok) ? 0 : 1;
} catch {
  console.error(
    "Set VULTR_API_KEY securely or save the key alone in work/vultr-api-key (chmod 600). An optional argument specifies a key FILE, never the key itself.",
  );
  process.exitCode = 1;
}
