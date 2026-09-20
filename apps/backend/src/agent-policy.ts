import { z } from "zod";
import type {
  AgentHandoffPolicy,
  AgentTrustEvaluation,
} from "../../../packages/shared/src/contracts.js";

export const agentHandoffPolicy: AgentHandoffPolicy = {
  authorize(input, receivingUserId) {
    const publicSource = ["gobblerconnect", "vt-sports", "discord", "vt-events"].includes(
      input.sender,
    );
    if (
      input.visibility === "public" &&
      !input.userId &&
      !receivingUserId &&
      ((input.kind === "public_events" &&
        publicSource &&
        input.recipient === "coordinator") ||
        (input.kind === "recommendations" &&
          input.sender === "coordinator" &&
          input.recipient === "assistant"))
    )
      return;
    if (
      input.kind === "private_context" &&
      input.visibility === "user" &&
      ["canvas", "google-calendar"].includes(input.sender) &&
      input.recipient === "assistant" &&
      typeof input.userId === "string" &&
      input.userId.length > 0 &&
      input.userId === receivingUserId
    )
      return;
    throw new Error("Agent handoff is not authorized");
  },
};

const score = z.number().int().min(0).max(100);
/** Pure Appendix-B shape validation for diagnostics only. Does not verify a VC proof,
 * establish an agent identity, grant permission or accept a recommendedProfile as authorization.
 * Rejects mismatched subjects and stale/future evaluations. No effects, retries or transactions. */
export function parseUnverifiedTrustEvaluation(
  value: unknown,
  expectedAnsName: string,
  now = Date.now(),
): AgentTrustEvaluation {
  const result = z
    .object({
      agentId: z.literal(expectedAnsName),
      evaluationTime: z.iso.datetime({ offset: true }),
      trustVector: z.object({
        integrity: score,
        identity: score,
        solvency: score,
        behavior: score,
        safety: score,
      }),
      recommendedProfile: z.enum([
        "READ_ONLY",
        "TRANSACTIONAL",
        "FIDUCIARY",
        "UNTRUSTED",
      ]),
      riskFactors: z.array(z.string().max(200)).max(100),
      verificationTier: z.enum(["BRONZE", "SILVER", "GOLD"]).optional(),
    })
    .parse(value);
  const age = now - Date.parse(result.evaluationTime);
  if (age < 0 || age > 3600000)
    throw new Error("Trust evaluation is not fresh");
  return result;
}
