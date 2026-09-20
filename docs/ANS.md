# ANS in MyGobbler

Implementation reviewed 2026-09-19. See Master.md for product policy.

## Scope

`ans-verification.ts` verifies incoming caller identity using operator-pinned identities, live DNS discovery and HTTPS transparency badges. `ans-handoff.ts` binds this to an actual mutual-TLS socket before executing a callback. `agent-policy.ts` separately enforces role and user boundaries. All contracts are type-only additions in `packages/shared/src/contracts.ts`; the browser has no verification logic or credentials.

The current monolithic runtime uses local policy checks only. The remote boundary is not mounted in the public Express server. ANS is not enabled on the hosted application by these changes. The user confirmed no identities or certificates have been registered yet. Canvas is excluded from the intended integration scope; its remaining legacy types/code do not authorize a new Canvas deployment.

## Operations and effects

| Operation | Inputs and return | Effects and failures |
|---|---|---|
| `createAnsVerifier` | Operator-owned peer pins, trusted log origins, optional backend adapters; returns verification service | Validates configuration; no registration or persistence |
| `verifyCaller` | Expected role and TLS-adapter certificate evidence; returns verified identity/status/time | DNS + HTTPS reads; rejects invalid identity, status or unavailable evidence; no model calls or data writes |
| `verifyCallee` | Expected role, operator-selected dialed hostname and trusted TLS evidence | Verifies registered server certificate, host, identity and fresh status; never accepts an identity-certificate entry as a server certificate |
| `sendAnsHandoff` | Established authenticated TLS socket, outgoing verifier, pinned recipient/host and callback | Verifies the recipient before callback can send application bytes on the same socket; failure destroys the socket; no reconnection or retry |
| `receiveAnsHandoff` | Real TLS socket, verifier, trusted route handoff, scoped user ID, operation callback | Permission check and identity verification precede callback; failed checks never invoke it; callback owns effects, transactions and idempotency; no automatic retries |
| `agentHandoffPolicy.authorize` | Sender/recipient/data class and authenticated receiving user | Pure permission check, throws on denial; never grants provider-write permission |
| `parseUnverifiedTrustEvaluation` | Diagnostic payload, expected ANS subject and clock | Pure shape/subject/freshness validation, **not** credential-signature verification or authorization |

Pin configuration is backend-owned. Never take role, expected user or trust-log origin from the message being verified. TLS chain validation is performed by Node against operator-configured client CAs; certificate fingerprint/registration validation is additional. Internal `authorized` evidence must never be deserialized from HTTP. Use the socket boundary for network callers.

## Deploying separate agents later

1. Register distinct identities with the chosen ANS operator and obtain identity certificates through its approved enrollment process.
2. Pin registration UUID, exact versioned ANS name, DNS hostname and trusted transparency-log origin for each role. Publish the prescribed badge DNS records.
3. Provision certificate keys outside source control and configure the backend TLS listener with `requestCert: true`, `rejectUnauthorized: true` and the approved private client CA.
4. Terminate agent mutual TLS at the backend boundary, or use transport pass-through. Do not pass identity claims through ordinary proxy headers. The existing web reverse proxy does not supply this guarantee.
5. Define narrow routes with fixed sender/recipient/action metadata and authoritative user scope. Run `receiveAnsHandoff` before payload processing. Validate payload and source ownership afterward. Add outgoing server-identity verification before sending sensitive data to remote agents.
6. Validate certificate rotation, expired/revoked peers, unavailable DNS/logs and user isolation in staging before enabling remote transfers. Add operational metrics without private payloads or credentials.

There is no production environment switch that magically enables this architecture. No DNS, registrations, deployment settings or paid services were changed.

## Limitations

This implements incoming and outgoing badge/TLS verification boundaries, not full ANS conformance. DPoP, SCITT/offline receipts, signed Trust Index credentials and lifecycle automation remain future work. Fresh badge lookups have an availability cost; failure denies the operation. WARNING/DEPRECATED remain distinguishable accepted states. TLS authenticates a connection, not a unique business operation: revision checks/idempotency still belong to the receiving module. Identity never proves content correctness or prompt-injection resistance. The outgoing gate is a trusted transport primitive, not a complete HTTP client: its caller must establish the intended TLS connection, enforce independent data/user authorization, and send only on the verified socket. No current data pipeline calls it yet.

Test certificate/key files under `tests/fixtures/ans-test-*` are synthetic, self-signed fixtures for loopback tests only. Never configure them as production identities or trust anchors.

## References

- [ANS-6 draft: identity, liveness, possession and separate authorization](https://github.com/agentnameservice/ans-registry/blob/main/spec/ans-6-agent-authentication.md).
- [Registry and Trust Index specifications](https://github.com/agentnameservice/ans-registry).
- [ANS reference implementation](https://github.com/agentnameservice/ans), [Go SDK](https://github.com/agentnameservice/ans-sdk-go), [Trust Index implementation](https://github.com/agentnameservice/agent-trust-discovery).

The Node implementation consumes the badge protocol directly; it does not install or run the Go reference services.
