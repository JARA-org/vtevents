import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { X509Certificate, createHash } from "node:crypto";
import { createServer, request } from "node:https";
import { connect, type TLSSocket } from "node:tls";
import { createAnsVerifier } from "../apps/backend/src/ans-verification.js";
import { receiveAnsHandoff, sendAnsHandoff } from "../apps/backend/src/ans-handoff.js";
import { agentHandoffPolicy } from "../apps/backend/src/agent-policy.js";
import type { AnsVerifierConfig } from "../packages/shared/src/contracts.js";

// Synthetic self-signed fixture, trusted ONLY by the local test server/client.
const cert = readFileSync(
  new URL("./fixtures/ans-test-cert.pem", import.meta.url),
  "utf8",
);
const key = readFileSync(
  new URL("./fixtures/ans-test-key.pem", import.meta.url),
  "utf8",
);
const x509 = new X509Certificate(cert);
const config: AnsVerifierConfig = {
  peers: [
    {
      role: "discord",
      agentId: "11111111-1111-4111-8111-111111111111",
      host: "source.example.test",
      version: "v1.0.0",
      ansName: "ans://v1.0.0.source.example.test",
    },
  ],
  trustedTransparencyOrigins: ["https://log.example.test"],
};
const pin = config.peers[0];
const url = `https://log.example.test/v1/agents/${pin.agentId}`;
const digest = "SHA256:" + createHash("sha256").update(x509.raw).digest("hex");
const now = Date.parse(x509.validFrom) + 60000;
function fixture(status = "ACTIVE", fingerprint = digest, badgeUrl = url, certificateKind = "identityCerts") {
  let requests = 0;
  const verifier = createAnsVerifier(config, {
    now: () => now,
    txt: async () => [[`v=ans-badge1; version=v1.0.0; url=${badgeUrl}`]],
    fetch: async () => {
      requests++;
      return new Response(
        JSON.stringify({
          status,
          payload: {
            producer: {
              event: {
                ansId: pin.agentId,
                ansName: pin.ansName,
                agent: { host: pin.host, version: pin.version },
                attestations: { [certificateKind]: [{ fingerprint }] },
              },
            },
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  return { verifier, requests: () => requests };
}
test("ANS binds a live badge to a pinned TLS certificate", async () => {
  for (const status of ["ACTIVE", "WARNING", "DEPRECATED"]) {
    const { verifier } = fixture(status);
    const result = await verifier.verifyCaller("discord", {
      authorized: true,
      certificatePem: cert,
    });
    assert.equal(result.fingerprint, digest);
    assert.equal(result.status, status);
  }
});
test("ANS fails closed on revoked, missing, or mismatched identities", async () => {
  for (const status of ["REVOKED", "EXPIRED", "UNKNOWN", "unexpected"])
    await assert.rejects(
      fixture(status).verifier.verifyCaller("discord", {
        authorized: true,
        certificatePem: cert,
      }),
    );
  await assert.rejects(
    fixture("ACTIVE", "SHA256:" + "0".repeat(64)).verifier.verifyCaller(
      "discord",
      { authorized: true, certificatePem: cert },
    ),
  );
  const { verifier, requests } = fixture();
  await assert.rejects(
    verifier.verifyCaller("canvas", { authorized: true, certificatePem: cert }),
  );
  await assert.rejects(
    verifier.verifyCaller("discord", {
      authorized: false,
      certificatePem: cert,
    }),
  );
  assert.equal(requests(), 0);
});
test("DNS cannot introduce a different trust root or agent", async () => {
  for (const destination of [
    "https://evil.example/v1/agents/" + pin.agentId,
    "http://log.example.test/v1/agents/" + pin.agentId,
    url + "?redirect=1",
    url.replace(pin.agentId, "other"),
  ]) {
    const { verifier, requests } = fixture("ACTIVE", digest, destination);
    await assert.rejects(
      verifier.verifyCaller("discord", {
        authorized: true,
        certificatePem: cert,
      }),
    );
    assert.equal(requests(), 0);
  }
});
test("ANS rejects unavailable DNS and expired certificates", async () => {
  for (const deps of [
    {
      txt: async () => {
        throw new Error("unavailable");
      },
      now: () => now,
    },
    { now: () => Date.parse(x509.validTo) + 1 },
  ]) {
    const verifier = createAnsVerifier(config, deps);
    await assert.rejects(
      verifier.verifyCaller("discord", {
        authorized: true,
        certificatePem: cert,
      }),
    );
  }
});
test("scope policy prevents private-context leakage and calendar writes", () => {
  agentHandoffPolicy.authorize({
    sender: "discord",
    recipient: "coordinator",
    kind: "public_events",
    visibility: "public",
  });
  agentHandoffPolicy.authorize(
    {
      sender: "canvas",
      recipient: "assistant",
      kind: "private_context",
      visibility: "user",
      userId: "alice",
    },
    "alice",
  );
  assert.throws(() =>
    agentHandoffPolicy.authorize(
      {
        sender: "canvas",
        recipient: "assistant",
        kind: "private_context",
        visibility: "user",
        userId: "alice",
      },
      "bob",
    ),
  );
  assert.throws(() =>
    agentHandoffPolicy.authorize({
      sender: "canvas",
      recipient: "coordinator",
      kind: "public_events",
      visibility: "public",
    }),
  );
  assert.throws(() =>
    agentHandoffPolicy.authorize(
      {
        sender: "assistant",
        recipient: "google-calendar",
        kind: "calendar_write",
        visibility: "user",
        userId: "alice",
      },
      "alice",
    ),
  );
});
test("handoff requires a real authenticated TLS connection before effects", async () => {
  const handoff = {
    sender: "discord",
    recipient: "coordinator",
    kind: "public_events",
    visibility: "public",
  } as const;
  let effects = 0;
  await assert.rejects(
    receiveAnsHandoff(
      { authorized: true } as TLSSocket,
      fixture().verifier,
      handoff,
      async () => {
        effects++;
      },
    ),
  );
  const server = createServer(
    { key, cert, ca: cert, requestCert: true, rejectUnauthorized: true },
    async (req, res) => {
      try {
        await receiveAnsHandoff(
          req.socket as TLSSocket,
          fixture().verifier,
          handoff,
          async () => {
            effects++;
          },
        );
        res.end("accepted");
      } catch {
        res.statusCode = 403;
        res.end("denied");
      }
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: address.port,
          servername: pin.host,
          ca: cert,
          cert,
          key,
          agent: false,
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 200);
    assert.equal(effects, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("outgoing ANS requires server registration and the intended host, never an identity certificate entry", async () => {
  const evidence = { authorized: true, certificatePem: cert };
  const good = fixture("ACTIVE", digest, url, "serverCerts");
  assert.equal((await good.verifier.verifyCallee("discord", pin.host, evidence)).fingerprint, digest);
  await assert.rejects(good.verifier.verifyCallee("discord", "other.example.test", evidence));
  await assert.rejects(fixture().verifier.verifyCallee("discord", pin.host, evidence));
  await assert.rejects(good.verifier.verifyCaller("discord", evidence));
  await assert.rejects(fixture("REVOKED", digest, url, "serverCerts").verifier.verifyCallee("discord", pin.host, evidence));
});

test("outgoing socket gate sends nothing to an unverified recipient", async () => {
  let requests = 0;
  const server = createServer({ key, cert, ca: cert, requestCert: true, rejectUnauthorized: true }, (_, response) => {
    requests++;
    response.end("ok");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    for (const accepted of [false, true]) {
      const socket = connect({ host: "127.0.0.1", port: address.port, servername: pin.host, ca: cert, cert, key });
      await new Promise<void>((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); });
      let effects = 0;
      const operation = sendAnsHandoff(socket, fixture(accepted ? "ACTIVE" : "REVOKED", digest, url, "serverCerts").verifier, "discord", pin.host, async verifiedSocket => {
        effects++;
        assert.equal(verifiedSocket, socket);
        const done = new Promise<void>((resolve, reject) => { socket.on("data", () => {}); socket.once("end", resolve); socket.once("error", reject); });
        socket.write("GET / HTTP/1.1\r\nHost: source.example.test\r\nConnection: close\r\n\r\n");
        await done;
      });
      if (accepted) await operation;
      else await assert.rejects(operation);
      assert.equal(effects, accepted ? 1 : 0);
      socket.destroy();
    }
    assert.equal(requests, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
