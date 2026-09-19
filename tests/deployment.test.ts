import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { checkProductionConfig } from "../deploy/lib/config.mjs";
import { smokeDeployment } from "../deploy/lib/smoke.mjs";

const production = () => ({
  MONGODB_URI:
    "mongodb+srv://app:synthetic@cluster.mongodb.net/?retryWrites=true",
  MONGODB_DB: "my_little_gobbler",
  ...Object.fromEntries(
    [
      "BETTER_AUTH_SECRET",
      "TOKEN_ENCRYPTION_KEY",
      "ANALYTICS_SALT",
      "JOB_SECRET",
    ].map((key) => [key, randomBytes(32).toString("hex")]),
  ),
});
const text = (values: Record<string, string>) =>
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

test("production preflight preserves raw secrets and rejects unsafe/incomplete configuration without leaking values", () => {
  const good = {
    ...production(),
    BETTER_AUTH_SECRET: `literal-$VALUE#${randomBytes(32).toString("hex")}`,
  };
  assert.deepEqual(
    checkProductionConfig(text(good), "gobbler.vt.edu").errors,
    [],
  );
  assert.equal(
    checkProductionConfig(text(good), "gobbler.vt.edu").values
      .BETTER_AUTH_SECRET,
    good.BETTER_AUTH_SECRET,
  );
  for (const patch of [
    { TOKEN_ENCRYPTION_KEY: "not-hex" },
    { JOB_SECRET: "" },
    { ANALYTICS_SALT: good.BETTER_AUTH_SECRET },
    {
      MONGODB_URI: "mongodb+srv://app:synthetic@cluster.mongodb.net/?tls=false",
    },
    {
      MONGODB_URI:
        "mongodb+srv://app:synthetic@cluster.mongodb.net/?tlsAllowInvalidCertificates=true",
    },
    { APP_ORIGIN: "http://gobbler.vt.edu" },
    { GOOGLE_CLIENT_ID: "incomplete" },
    { JOB_SECRET: '"quoted-secret"' },
    { GEMINI_API_KEY: "YOUR_KEY" },
    { EXPO_PUBLIC_SECRET: "accidental-exposure" },
  ]) {
    const { errors } = checkProductionConfig(
      text({ ...good, ...patch }),
      "gobbler.vt.edu",
    );
    assert.ok(errors.length, JSON.stringify(Object.keys(patch)));
    assert.ok(!errors.join(" ").includes(good.BETTER_AUTH_SECRET));
    assert.ok(!errors.join(" ").includes("synthetic"));
  }
  for (const domain of [
    undefined,
    "localhost",
    "127.0.0.1",
    "https://gobbler.vt.edu",
    "host.test",
    "a.vt.edu/path",
    "a.vt.edu:443",
    "a..edu",
  ])
    assert.ok(checkProductionConfig(text(good), domain).errors.length);
  assert.ok(
    checkProductionConfig(
      `${text(good)}\nJOB_SECRET=duplicate`,
      "gobbler.vt.edu",
    ).errors.length,
  );
});

test("HTTPS smoke verifies v2 and anonymous rejection using GET only", async () => {
  const seen: string[] = [];
  const results = await smokeDeployment(
    "https://gobbler.vt.edu",
    async (url: URL, init: RequestInit) => {
      seen.push(url.pathname);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      assert.equal(init.body, undefined);
      if (url.pathname === "/")
        return new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        });
      if (url.pathname === "/api/demo/events")
        return new Response("Not Found", { status: 404 });
      const payload =
        url.pathname === "/api/health"
          ? { ok: true, database: true, accounts: true }
          : url.pathname === "/api/bootstrap"
            ? { contractVersion: 2, categories: [] }
            : {};
      const status = ["/api/health", "/api/bootstrap"].includes(url.pathname)
        ? 200
        : url.pathname === "/api/demo/events"
          ? 404
          : 401;
      return Response.json(payload, { status });
    },
  );
  assert.equal(seen.length, 7);
  assert.ok(results.every((r: { ok: boolean }) => r.ok));
});

test("smoke rejects disconnected services, anonymous access, redirects and malformed responses", async () => {
  const bad = await smokeDeployment("https://gobbler.vt.edu", async () =>
    Response.json({ ok: true, database: false, accounts: false }),
  );
  assert.ok(bad.every((r: { ok: boolean }) => !r.ok));
  const failed = await smokeDeployment("https://gobbler.vt.edu", async () => {
    throw new Error("private upstream body");
  });
  assert.ok(failed.every((r: { ok: boolean }) => !r.ok));
  assert.ok(!JSON.stringify(failed).includes("private upstream"));
  for (const origin of [
    "http://gobbler.vt.edu",
    "https://user:password@gobbler.vt.edu",
    "https://gobbler.vt.edu/path",
    "https://gobbler.vt.edu?token=secret",
  ])
    await assert.rejects(
      smokeDeployment(origin, () => assert.fail("must not fetch")),
    );
});

test("deployment requires signed Discord bot configuration and explicit collection/AI flags", () => {
  const base = {
    ...production(),
    DISCORD_CLIENT_ID: "1550880609491222639",
    DISCORD_PUBLIC_KEY: "a".repeat(64),
    DISCORD_BOT_TOKEN: "synthetic-test-token",
  };
  assert.deepEqual(
    checkProductionConfig(text(base), "gobbler.example.org").errors,
    [],
  );
  assert.deepEqual(
    checkProductionConfig(
      text({
        ...base,
        DISCORD_COLLECTION_ENABLED: "true",
        DISCORD_AI_ENABLED: "true",
        DISCORD_AI_GUILD_DAILY_LIMIT: "20",
        DISCORD_AI_GUILD_HOURLY_LIMIT: "5",
        GEMINI_API_KEY: "synthetic-test-key",
      }),
      "gobbler.example.org",
    ).errors,
    [],
  );
  for (const patch of [
    { DISCORD_PUBLIC_KEY: "" },
    { DISCORD_PUBLIC_KEY: "invalid" },
    { DISCORD_BOT_TOKEN: "" },
    { DISCORD_CLIENT_SECRET: "retired-secret" },
    { DISCORD_CLIENT_ID: "not-an-id" },
    { DISCORD_COLLECTION_ENABLED: "yes" },
    { DISCORD_AI_ENABLED: "true" },
    { DISCORD_AI_GUILD_DAILY_LIMIT: "21" },
    { DISCORD_AI_GUILD_DAILY_LIMIT: "-1" },
    { DISCORD_AI_GUILD_HOURLY_LIMIT: "6" },
    { DISCORD_AI_GUILD_HOURLY_LIMIT: "-1" },
  ])
    assert.ok(
      checkProductionConfig(text({ ...base, ...patch }), "gobbler.example.org")
        .errors.length,
    );
  assert.ok(
    checkProductionConfig(
      text({ ...production(), DISCORD_COLLECTION_ENABLED: "true" }),
      "gobbler.example.org",
    ).errors.length,
  );
});
