/** Operator-only API access check. Input: API key and optional HTTP test port.
 * Returns sanitized check receipts; reads account and first instance-list page only.
 * Requires account-read and instance-list permission. No writes, retries or transaction.
 * HTTP/network/shape failures return failed receipts without provider response bodies.
 */
export async function checkVultrAccess(key, request = fetch) {
  if (!key || /\s/.test(key))
    throw new Error("A nonempty, single-line Vultr API key is required.");
  const checks = [];
  for (const path of ["/account", "/instances?per_page=100"]) {
    try {
      const response = await request(`https://api.vultr.com/v2${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        // Vultr may report IP restrictions as 401 as well as 403. Inspect only
        // for this category; never include the provider's text in the receipt.
        const body = await response.text();
        const ipBlocked =
          /(?:invalid|unauthorized|not allowed|not authorized|denied|whitelist|allowlist).{0,60}(?:IP|address)|(?:IP|address).{0,60}(?:invalid|unauthorized|not allowed|not authorized|denied|whitelist|allowlist)/i.test(
            body,
          );
        const reason =
          [401, 403].includes(response.status) && ipBlocked
            ? "API IP access restriction. Allow this execution host's outbound IP in Vultr Account > API > Access Control."
            : response.status === 401
              ? "API key rejected. Check whether it is enabled or revoked."
              : response.status === 403
                ? "Access denied. Check API IP allowlist and account permissions."
                : response.status === 429
                  ? "Rate limited. Try again later."
                  : "Vultr request failed.";
        checks.push({ path, ok: false, status: response.status, reason });
      } else {
        const data = await response.json();
        if (path === "/account") {
          if (!data.account || typeof data.account.email !== "string")
            throw new Error();
          checks.push({
            path,
            ok: true,
            authenticated: true,
            // Do not print identity, arbitrary strings, API keys or full responses.
            balance:
              typeof data.account.balance === "number"
                ? data.account.balance
                : null,
            pendingCharges:
              typeof data.account.pending_charges === "number"
                ? data.account.pending_charges
                : null,
          });
        } else {
          if (!Array.isArray(data.instances)) throw new Error();
          checks.push({
            path,
            ok: true,
            instancesOnPage: data.instances.length,
            hasMore: Boolean(data.meta?.links?.next),
          });
        }
      }
    } catch {
      checks.push({
        path,
        ok: false,
        reason:
          "Network, TLS, redirect, timeout or invalid response. No credential or response body was logged.",
      });
    }
    if (path === "/account" && !checks.at(-1).ok) break;
  }
  return checks;
}
