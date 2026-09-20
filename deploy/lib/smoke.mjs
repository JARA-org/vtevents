/** Operator-only read-only probe of an explicit HTTPS origin (optional fetch port for tests).
 * Returns check receipts, never response bodies/secrets. GETs only; no session or domain writes.
 * Network/status/shape failures become failed receipts; safe to rerun, no retries/transaction.
 */
export async function smokeDeployment(origin, request = fetch) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Supply an HTTPS origin without credentials, path, query or fragment.",
    );
  const checks = [
    {
      path: "/",
      status: 200,
      accept: "text/html",
      validate: async (r) => /<html[\s>]/i.test(await r.text()),
    },
    {
      path: "/api/health",
      status: 200,
      accept: "application/json",
      validate: async (r) => {
        const h = await r.json();
        return h.ok === true && h.database === true && h.accounts === true;
      },
    },
    {
      path: "/api/bootstrap",
      status: 200,
      accept: "application/json",
      validate: async (r) => {
        const b = await r.json();
        return b.contractVersion === 5 && Array.isArray(b.categories);
      },
    },
    ...["/api/me", "/api/events", "/api/recommendations"].map((path) => ({
      path,
      status: 401,
      accept: "application/json",
    })),
    { path: "/api/demo/events", status: 404, accept: "*/*" },
  ];
  const results = [];
  for (const check of checks) {
    try {
      const response = await request(new URL(check.path, url), {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: { Accept: check.accept },
      });
      const ok =
        response.status === check.status &&
        (check.accept === "*/*" ||
          (response.headers.get("content-type") || "").includes(
            check.accept,
          )) &&
        (!check.validate || (await check.validate(response)));
      await response.body?.cancel().catch(() => {});
      results.push({
        path: check.path,
        ok,
        message: ok
          ? "passed"
          : "unexpected status, content type or response shape",
      });
    } catch {
      results.push({
        path: check.path,
        ok: false,
        message:
          "request failed (network, TLS, redirect, timeout or invalid response)",
      });
    }
  }
  return results;
}
