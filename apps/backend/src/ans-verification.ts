import { X509Certificate, createHash } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { z } from "zod";
import type {
  AnsVerifierConfig,
  AnsPeerVerificationService,
  AgentRole,
  AnsTransportIdentity,
  AnsVerifiedIdentity,
} from "../../../packages/shared/src/contracts.js";

const role = z.enum([
  "vt-events",
  "gobblerconnect",
  "vt-sports",
  "discord",
  "canvas",
  "google-calendar",
  "coordinator",
  "assistant",
]);
const host = z
  .string()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/);
export const ansConfigSchema = z
  .object({
    peers: z
      .array(
        z
          .object({
            role,
            agentId: z.uuid(),
            host,
            version: z.string().regex(/^v\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/),
            ansName: z.string().max(350),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    trustedTransparencyOrigins: z.array(z.string().url()).min(1).max(16),
  })
  .strict();
const fingerprint = z.string().regex(/^SHA256:[a-f0-9]{64}$/);
const badgeSchema = z.object({
  schemaVersion: z.enum(["V1", "V2"]).optional(),
  status: z.enum([
    "ACTIVE",
    "WARNING",
    "DEPRECATED",
    "EXPIRED",
    "REVOKED",
    "UNKNOWN",
  ]),
  payload: z.object({
    producer: z.object({
      event: z.object({
        ansId: z.uuid(),
        ansName: z.string(),
        agent: z.object({ host: z.string(), version: z.string() }),
        attestations: z.object({
          identityCerts: z.array(z.object({ fingerprint })).max(32).optional(),
          serverCerts: z.array(z.object({ fingerprint })).max(32).optional(),
          validIdentityCerts: z.array(z.object({ fingerprint })).max(32).optional(),
          validServerCerts: z.array(z.object({ fingerprint })).max(32).optional(),
        }),
      }),
    }),
  }),
});

/** Bounded JSON HTTPS adapter; rejects redirects and limits bytes before parsing. No credentials,
 * provider text, private user data or model calls. Caller must pin the origin before invocation. */
async function readBadge(
  url: string,
  transport: typeof fetch,
): Promise<unknown> {
  const response = await transport(url, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
    headers: { accept: "application/json" },
  });
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error("ANS badge unavailable");
  const stream = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await stream.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) throw new Error("ANS badge too large");
      chunks.push(value);
    }
  } finally {
    await stream.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Creates an ANS-6 Method-A/badge-tier verifier. Config is operator-owned; dependencies are
 * backend adapters/test doubles, never caller input. No registration or paid effects. Each call
 * uses fresh evidence and fails closed; it does not implement DPoP, SCITT or trust-score authorization. */
export function createAnsVerifier(
  config: AnsVerifierConfig,
  deps: {
    txt?: typeof resolveTxt;
    fetch?: typeof fetch;
    now?: () => number;
  } = {},
): AnsPeerVerificationService {
  const settings = ansConfigSchema.parse(config),
    pins = new Map(settings.peers.map((peer) => [peer.role, peer]));
  if (pins.size !== settings.peers.length)
    throw new Error("Duplicate ANS roles");
  if (
    new Set(settings.peers.map((p) => p.ansName)).size !== settings.peers.length
  )
    throw new Error("Agent roles require distinct ANS identities");
  for (const peer of settings.peers)
    if (peer.ansName !== `ans://${peer.version}.${peer.host}`)
      throw new Error("Invalid pinned ANS name");
  const origins = new Set(
    settings.trustedTransparencyOrigins.map((value) => {
      const u = new URL(value);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/"
      )
        throw new Error("Invalid transparency origin");
      return u.origin;
    }),
  );
  const txt = deps.txt || resolveTxt,
    transport = deps.fetch || fetch,
    clock = deps.now || Date.now;
  async function verify(sender: AgentRole, evidence: AnsTransportIdentity, direction: "caller" | "callee", dialedHost?: string): Promise<AnsVerifiedIdentity> {
      const peer = pins.get(sender);
      if (
        !peer ||
        evidence.authorized !== true ||
        evidence.certificatePem.length > 32768
      )
        throw new Error("ANS TLS identity unavailable");
      if (direction === "callee" && dialedHost !== peer.host)
        throw new Error("ANS dialed host does not match pinned peer");
      const certificate = new X509Certificate(evidence.certificatePem),
        now = clock();
      if (
        now < Date.parse(certificate.validFrom) ||
        now > Date.parse(certificate.validTo)
      )
        throw new Error("ANS certificate expired or not yet valid");
      if (
        certificate.checkHost(peer.host, {
          subject: "never",
          wildcards: false,
        }) !== peer.host
      )
        throw new Error("ANS certificate host mismatch");
      // URI is operator-pinned ASCII without commas/quotes. Do not accept a substring or CN fallback.
      if (
        direction === "caller" && !certificate.subjectAltName?.split(", ").includes(`URI:${peer.ansName}`)
      )
        throw new Error("ANS certificate URI mismatch");
      const digest =
        "SHA256:" + createHash("sha256").update(certificate.raw).digest("hex");
      let timer: ReturnType<typeof setTimeout> | undefined;
      let rows: string[][];
      try {
        rows = await Promise.race([
          txt(`_ans-badge.${peer.host}`),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("ANS DNS timeout")),
              5000,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (rows.length > 32) throw new Error("Too many ANS records");
      const urls: string[] = [];
      for (const chunks of rows) {
        const record = chunks.join("");
        if (record.length > 4096) throw new Error("ANS record too large");
        const fields = new Map<string, string>();
        for (const part of record.split(";")) {
          const i = part.indexOf("=");
          if (i < 0) continue;
          const k = part.slice(0, i).trim(),
            v = part.slice(i + 1).trim();
          if (fields.has(k)) throw new Error("Duplicate ANS record field");
          fields.set(k, v);
        }
        if (
          fields.get("v") === "ans-badge1" &&
          fields.get("version") === peer.version &&
          fields.has("url")
        )
          urls.push(fields.get("url")!);
      }
      if (urls.length !== 1)
        throw new Error("ANS registration absent or ambiguous");
      const url = new URL(urls[0]);
      if (
        !origins.has(url.origin) ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== `/v1/agents/${peer.agentId}`
      )
        throw new Error("ANS badge source not trusted");
      const badge = badgeSchema.parse(await readBadge(url.href, transport)),
        event = badge.payload.producer.event;
      if (!["ACTIVE", "WARNING", "DEPRECATED"].includes(badge.status))
        throw new Error("ANS registration is not active");
      if (
        event.ansId !== peer.agentId ||
        event.ansName !== peer.ansName ||
        event.agent.host !== peer.host ||
        event.agent.version !== peer.version
      )
        throw new Error("ANS registration identity mismatch");
      // GoDaddy's production v1 endpoint publishes current rotation arrays under
      // valid*Certs. Never fall back to the historical singular certificate.
      const certificates = badge.schemaVersion === "V1"
        ? (direction === "caller" ? event.attestations.validIdentityCerts : event.attestations.validServerCerts)
        : (direction === "caller" ? event.attestations.identityCerts : event.attestations.serverCerts);
      if (
        !certificates?.some(
          (entry) => entry.fingerprint === digest,
        )
      )
        throw new Error("ANS certificate is not registered");
      if (clock() > Date.parse(certificate.validTo))
        throw new Error("ANS certificate expired during verification");
      return {
        role: sender,
        agentId: peer.agentId,
        ansName: peer.ansName,
        fingerprint: digest,
        status: badge.status as "ACTIVE" | "WARNING" | "DEPRECATED",
        checkedAt: new Date(clock()).toISOString(),
        method: "mtls",
        tier: "badge",
      };
  }
  return {
    verifyCaller: (sender, evidence) => verify(sender, evidence, "caller"),
    verifyCallee: (recipient, dialedHost, evidence) => verify(recipient, evidence, "callee", dialedHost),
  };
}
