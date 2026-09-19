import test from "node:test";
import assert from "node:assert/strict";
import { checkVultrAccess } from "../deploy/lib/vultr.mjs";

test("Vultr access check uses fixed GET endpoints and suppresses credentials/identity", async () => {
  const calls: string[] = [];
  const key = "test-only-credential";
  const result = await checkVultrAccess(
    key,
    async (url: string, init: RequestInit) => {
      calls.push(url);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      assert.deepEqual(init.headers, {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      });
      return Response.json(
        url.endsWith("/account")
          ? {
              account: {
                email: "private@example.test",
                balance: -100,
                pending_charges: 0,
                key,
              },
            }
          : {
              instances: [{ id: "private-id", default_password: key }],
              meta: { links: { next: "cursor" } },
            },
      );
    },
  );
  assert.deepEqual(calls, [
    "https://api.vultr.com/v2/account",
    "https://api.vultr.com/v2/instances?per_page=100",
  ]);
  assert.ok(result.every((r: { ok: boolean }) => r.ok));
  assert.equal(result[1].instancesOnPage, 1);
  assert.equal(result[1].hasMore, true);
  for (const secret of [key, "private@example.test", "private-id"])
    assert.ok(!JSON.stringify(result).includes(secret));
});

test("Vultr access fails closed on auth/allowlist errors without retries or leaking bodies", async () => {
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    const result = await checkVultrAccess("synthetic-key", async () => {
      calls++;
      return new Response("sensitive-error-body", { status });
    });
    assert.equal(calls, 1);
    assert.equal(result[0].ok, false);
    assert.equal(result[0].status, status);
    assert.ok(!JSON.stringify(result).includes("sensitive-error-body"));
  }
  const invalid = await checkVultrAccess("synthetic-key", async () =>
    Response.json({}),
  );
  assert.equal(invalid[0].ok, false);
  const restricted = await checkVultrAccess("synthetic-key", async () =>
    Response.json(
      { error: "Your IP address is not allowed: sensitive-detail" },
      { status: 401 },
    ),
  );
  assert.match(restricted[0].reason, /IP access restriction/);
  assert.ok(!JSON.stringify(restricted).includes("sensitive-detail"));
  await assert.rejects(
    checkVultrAccess("", () => assert.fail("must not fetch")),
  );
});
