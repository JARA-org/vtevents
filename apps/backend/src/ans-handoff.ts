import { TLSSocket } from "node:tls";
import type {
  AgentHandoff,
  AnsVerificationService,
  AnsVerifiedIdentity,
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
