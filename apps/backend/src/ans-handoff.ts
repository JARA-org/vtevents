import { TLSSocket } from "node:tls";
import type {
  AgentHandoff,
  AnsVerificationService,
  AnsVerifiedIdentity,
  AnsPeerVerificationService,
  AgentRole,
} from "../../../packages/shared/src/contracts.js";
import { agentHandoffPolicy } from "./agent-policy.js";

/** Trusted backend TLS boundary. The caller supplies the expected handoff from its route/job
 * configuration and receivingUserId from its authenticated session, NOT request JSON.
 * Reads the real peer certificate; forwarded certificate/role headers are never considered.
 * Verifies before invoking the operation. The operation owns schema checks, idempotency,
 * transactions and side effects. A failure never invokes it; this wrapper never retries it.
 * TLS must terminate here with requestCert/rejectUnauthorized and operator-pinned client CAs.
 */
export async function receiveAnsHandoff<T>(
  socket: TLSSocket,
  verifier: AnsVerificationService,
  expected: AgentHandoff,
  operation: (identity: AnsVerifiedIdentity) => Promise<T>,
  receivingUserId?: string,
): Promise<T> {
  agentHandoffPolicy.authorize(expected, receivingUserId);
  if (
    !(socket instanceof TLSSocket) ||
    !socket.encrypted ||
    socket.authorized !== true ||
    socket.destroyed
  )
    throw new Error("End-to-end authenticated TLS is required for ANS");
  const peer = socket.getPeerCertificate();
  if (!peer.raw?.length) throw new Error("ANS client certificate required");
  const identity = await verifier.verifyCaller(expected.sender, {
    authorized: true,
    certificatePem: `-----BEGIN CERTIFICATE-----\n${peer.raw
      .toString("base64")
      .match(/.{1,64}/g)!
      .join("\n")}\n-----END CERTIFICATE-----`,
  });
  if (identity.role !== expected.sender || socket.destroyed)
    throw new Error("ANS peer changed or disconnected");
  return operation(identity);
}

/** Outgoing same-socket gate. Call only after TLS secureConnect and before sending ANY application
 * bytes. Socket must be a fresh client connection with normal CA/hostname verification enabled.
 * Operator supplies recipient/host. No fallback, writes, reconnects or retries here. The callback
 * must send on this exact socket; opening another connection would discard the verified binding.
 * Authentication is not authorization: the caller separately enforces data/user scope. */
export async function sendAnsHandoff<T>(
  socket: TLSSocket,
  verifier: AnsPeerVerificationService,
  recipient: AgentRole,
  dialedHost: string,
  operation: (socket: TLSSocket, identity: AnsVerifiedIdentity) => Promise<T>,
): Promise<T> {
  try {
    if (!(socket instanceof TLSSocket) || !socket.encrypted || !socket.authorized || socket.destroyed)
      throw new Error("Authenticated outgoing TLS is required for ANS");
    const peer = socket.getPeerCertificate();
    if (!peer.raw?.length) throw new Error("ANS server certificate required");
    const identity = await verifier.verifyCallee(recipient, dialedHost, {
      authorized: true,
      certificatePem: `-----BEGIN CERTIFICATE-----\n${peer.raw.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`,
    });
    if (identity.role !== recipient || socket.destroyed)
      throw new Error("ANS receiving peer changed or disconnected");
    return await operation(socket, identity);
  } catch (error) {
    if (socket instanceof TLSSocket) socket.destroy();
    throw error;
  }
}
