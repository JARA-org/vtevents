import test from "node:test";
import assert from "node:assert/strict";
import { backend } from "../apps/frontend/services/backend.js";

test("transport errors give actionable copy without exposing server details", async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, message, expected] of [
      [400, "Invalid email", /email looks incomplete/],
      [401, "Invalid email or password", /Check your email and password/],
      [429, "Rate limited", /Wait a moment/],
      [
        500,
        "Internal database credentials and stack trace",
        /Give us a moment/,
      ],
    ] as const) {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ message }), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      await assert.rejects(
        backend.signIn({
          email: "test@example.invalid",
          password: "test-only-password",
          name: "Test",
          callbackURL: "/",
        }),
        expected,
      );
    }
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(
      backend.health(undefined),
      /Check your connection and try again/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
