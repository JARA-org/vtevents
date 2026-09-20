import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, type TLSSocket } from "node:tls";
import { Agent, createServer, request } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { AnsRuntimeServices, AnsPeerVerificationService, AssistantReply, CampusEvent } from "../../../packages/shared/src/contracts.js";
import { createAnsVerifier, ansConfigSchema } from "./ans-verification.js";
import { receiveAnsHandoff, sendAnsHandoff } from "./ans-handoff.js";
import { consolidateEvents } from "./event-consolidation.js";
import { eventSchema } from "./domain.js";
import { config } from "./config.js";

const limit = 4 * 1024 * 1024;
class AnsResponseError extends Error {
  constructor(readonly status: number) { super("ANS service rejected request"); }
}
const assistantRequests = new WeakSet<IncomingMessage>();
/** Internal transport evidence only; cannot be set by HTTP headers or JSON. */
export const isAnsAssistantRequest = (req: IncomingMessage) => assistantRequests.has(req);
export let ansRuntime: AnsRuntimeServices | undefined;

/** Public DTO gate. Preserve additive fields while validating core event fields;
 * explicitly reject private visibility before passing records to reconciliation. */
export function validateAnsEvents(value: unknown): CampusEvent[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error("Invalid event batch");
  return value.map(item => {
    if (!item || typeof item !== "object" || (item.visibility && item.visibility.kind !== "public"))
      throw new Error("Private event is not allowed");
    eventSchema.parse(item);
    return item as CampusEvent;
  });
}

async function readBody(stream: IncomingMessage): Promise<Buffer> {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > limit) throw new Error("ANS payload exceeds limit");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

/** Bootstrap authenticated loopback endpoints in the existing process. This is
 * transport authentication, NOT process/credential isolation. Reads operator
 * keys/pins only; opens two loopback listeners. No database writes or model calls
 * during startup. Missing configuration rejects startup; callers never silently
 * fall back after enabling ANS. Returns a shutdown hook. */
export async function startAnsRuntime(
  directory: string,
  assistantHandler: (req: IncomingMessage, res: ServerResponse) => void,
  testVerifier?: AnsPeerVerificationService,
): Promise<() => Promise<void>> {
  const pins = ansConfigSchema.parse(JSON.parse(readFileSync(join(directory, "peer-pins.json"), "utf8")));
  const verifier = testVerifier || createAnsVerifier(pins);
  const roles = ["discord", "coordinator", "assistant"] as const;
  const pem = (value: string) => value.startsWith("-----BEGIN") ? value : Buffer.from(value, "base64").toString("utf8");
  const credentials = Object.fromEntries(roles.map(role => {
    const root = join(directory, `${role}-1.0.0`);
    const cert = (kind: string) => {
      const stored = JSON.parse(readFileSync(join(root, `${kind}-certificates.json`), "utf8"));
      if (Array.isArray(stored) && stored.length !== 1) throw new Error("Select one active ANS certificate before startup");
      const bundle = Array.isArray(stored) ? stored[0] : stored;
      const chain = Array.isArray(bundle.chainPEM) ? bundle.chainPEM.map(pem).join("\n") : pem(bundle.chainPEM || "");
      if (!chain.includes("BEGIN CERTIFICATE")) throw new Error("ANS CA chain required");
      return { cert: pem(bundle.certificatePEM) + "\n" + chain, key: readFileSync(join(root, `${kind}.key`)), ca: chain };
    };
    if (!pins.peers.some(p => p.role === role)) throw new Error("ANS role pin missing");
    return [role, { identity: cert("identity"), server: cert("server") }];
  }));
  const ports = { coordinator: 3443, assistant: 3444 };
  let active = 0;
  const servers = (["coordinator", "assistant"] as const).map(recipient => {
    const sender = recipient === "coordinator" ? "discord" : "coordinator";
    const server = createServer({
      ...credentials[recipient].server,
      ca: credentials[sender].identity.ca,
      requestCert: true, rejectUnauthorized: true, minVersion: "TLSv1.2",
    }, (req, res) => {
      if (req.method !== "POST" || req.url !== "/handoff") { res.writeHead(404).end(); return; }
      if (active >= 4) { res.writeHead(503).end(); return; }
      active++;
      let released = false;
      const release = () => { if (!released) { active--; released = true; } };
      res.once("close", release);
      res.once("finish", release);
      const timer = setTimeout(() => { req.destroy(); res.destroy(); }, 25000);
      res.once("close", () => clearTimeout(timer));
      void receiveAnsHandoff(req.socket as TLSSocket, verifier, {
        sender, recipient, visibility: "public",
        kind: recipient === "coordinator" ? "public_events" : "recommendations",
      }, async () => {
        if (recipient === "assistant") {
          // This gate grants service access only. The normal assistant HTTP route
          // independently revalidates the original user's session and rate limit.
          assistantRequests.add(req);
          req.url = "/api/assistant";
          assistantHandler(req, res);
          return;
        }
        const body = z.object({ events: z.unknown() }).strict().parse(JSON.parse((await readBody(req)).toString("utf8")));
        const events = validateAnsEvents(body.events);
        const result = JSON.stringify({ events: consolidateEvents(events) });
        if (Buffer.byteLength(result) > limit) throw new Error("ANS result too large");
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(result);
      }).catch(() => { if (!res.headersSent) res.writeHead(503).end('{"error":"Agent verification or processing unavailable"}'); else res.destroy(); });
    });
    server.headersTimeout = 10000;
    server.requestTimeout = 25000;
    server.maxConnections = 16;
    return { recipient, server };
  });
  try {
    for (const { recipient, server } of servers) await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(ports[recipient], "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
  } catch (error) { servers.forEach(({server}) => server.close()); throw error; }

  const call = async (recipient: "coordinator" | "assistant", body: unknown, cookie?: string): Promise<unknown> => {
    const sender = recipient === "coordinator" ? "discord" : "coordinator";
    const peer = pins.peers.find(p => p.role === recipient)!;
    const payload = JSON.stringify(body);
    if (Buffer.byteLength(payload) > limit || (cookie?.length || 0) > 16384) throw new Error("ANS request too large");
    const socket = connect({ host: "127.0.0.1", port: ports[recipient], servername: peer.host,
      cert: credentials[sender].identity.cert, key: credentials[sender].identity.key,
      ca: credentials[recipient].server.ca, rejectUnauthorized: true, minVersion: "TLSv1.2" });
    const timer = setTimeout(() => socket.destroy(new Error("ANS request timed out")), 25000);
    // Keep a listener installed through the entire lifecycle, including the gap
    // while registry verification runs before HTTP attaches its own listener.
    socket.on("error", () => {});
    try {
      await new Promise<void>((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); });
      return await sendAnsHandoff(socket, verifier, recipient, peer.host, async verified => {
        const agent = new Agent({ keepAlive: false, maxSockets: 1 });
        agent.createConnection = () => verified;
        try {
          return await new Promise<unknown>((resolve, reject) => {
            const outgoing = request({ hostname: peer.host, port: ports[recipient], path: "/handoff", method: "POST", agent,
              headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload), origin: config.origin, ...(cookie ? { cookie } : {}) } }, response => {
              void readBody(response).then(bytes => {
                if (response.statusCode !== 200) throw new AnsResponseError(response.statusCode || 503);
                resolve(JSON.parse(bytes.toString("utf8")));
              }).catch(reject);
            });
            outgoing.once("error", reject);
            outgoing.end(payload);
          });
        } finally { agent.destroy(); }
      });
    } finally { clearTimeout(timer); socket.destroy(); }
  };
  ansRuntime = {
    reconcile: async events => {
      const result = z.object({events:z.unknown()}).strict().parse(await call("coordinator", {events:validateAnsEvents(events)}));
      return validateAnsEvents(result.events);
    },
    ask: async (query, cookie) => {
      const result = await call("assistant", {query}, cookie);
      const core = z.object({ engine:z.string(), notice:z.string(), answer:z.string(), recommendations:z.array(z.object({event:z.unknown(),score:z.number(),reason:z.string(),fit:z.unknown()})).max(40) }).parse(result);
      validateAnsEvents(core.recommendations.map(r => r.event));
      return result as AssistantReply;
    },
  };
  const stop = async () => { ansRuntime = undefined; await Promise.all(servers.map(({server}) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); };
  // Enabled production startup must prove both real connections work. The
  // assistant probe is deliberately anonymous: it must stop at session auth.
  if (!testVerifier) {
    try {
      await ansRuntime.reconcile([]);
      try { await ansRuntime.ask("ANS readiness check", ""); throw new Error("Anonymous assistant request accepted"); }
      catch (error) { if (!(error instanceof AnsResponseError) || error.status !== 401) throw error; }
    } catch (error) { await stop(); throw error; }
  }
  return stop;
}
