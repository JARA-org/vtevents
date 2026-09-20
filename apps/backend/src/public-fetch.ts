import { createHash } from "node:crypto";
import { RESEARCH_SHEET_URL } from "./research-sheet.js";
import type { PublicPageFetcher } from "../../../packages/shared/src/contracts.js";

/** Operator allowlist only: callers cannot choose hosts. No auth/cookies, bounded redirects and bytes. */
export function createPublicFetcher(
  transport: typeof fetch = fetch,
): PublicPageFetcher {
  return {
    async read(raw, allowedHosts, previous) {
      const validate = (value: string) => {
      const u = new URL(value);
      if(u.hostname==="docs.google.com" && u.href!==RESEARCH_SHEET_URL)throw new Error("Unapproved research sheet URL");
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          u.port ||
          !allowedHosts.includes(u.hostname) ||
          u.hash
        )
          throw new Error("Unapproved public source URL");
        return u.href;
      };
      let url = validate(raw);
      const headers: Record<string, string> = {
        accept:
          "text/html, application/ld+json, text/calendar, application/json, application/xml",
        "user-agent": "MyGobbler-Events/1.0",
      };
      if (previous?.etag) headers["if-none-match"] = previous.etag;
      if (previous?.lastModified)
        headers["if-modified-since"] = previous.lastModified;
      for (let redirects = 0; redirects < 4; redirects++) {
        const response = await transport(url, {
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        });
        const checkedAt = new Date().toISOString();
        if (response.status === 304) {
          if (!previous) throw new Error("Unexpected unchanged response");
          return {
            url: raw,
            hash: previous.hash,
            checkedAt,
            changed: false,
            etag: previous.etag,
            lastModified: previous.lastModified,
          };
        }
        if (response.status === 404 || response.status === 410)
          return {
            url: raw,
            hash: "removed",
            checkedAt,
            changed: previous?.hash !== "removed",
            removed: true,
          };
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          url = validate(
            new URL(response.headers.get("location") || "", url).href,
          );
          continue;
        }
        if (!response.ok || !response.body)
          throw new Error(`Public source HTTP ${response.status}`);
        const type = response.headers.get("content-type") || "";
        if (!/text\/|json|xml|calendar|octet-stream/i.test(type) && !(url===RESEARCH_SHEET_URL && /application\/javascript/i.test(type)))
          throw new Error("Unsupported source content type");
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const r = await reader.read();
            if (r.done) break;
            bytes += r.value.length;
            if (bytes > 8 * 1024 * 1024)
              throw new Error("Source page too large");
            chunks.push(r.value);
          }
        } finally {
          await reader.cancel();
        }
        const body = Buffer.concat(chunks).toString("utf8"),
          hash = createHash("sha256").update(body).digest("hex");
        return {
          url: raw,
          hash,
          checkedAt,
          changed: hash !== previous?.hash,
          ...(hash !== previous?.hash ? { body } : {}),
          etag: response.headers.get("etag") || undefined,
          lastModified: response.headers.get("last-modified") || undefined,
        };
      }
      throw new Error("Too many public source redirects");
    },
  };
}
