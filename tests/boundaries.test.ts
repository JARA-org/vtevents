import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "../scripts/check-architecture.mjs";

test("frontend boundary rejects provider SDKs, backend imports, runtime shared imports and UI fetches", () => {
  for (const source of [
    'import { GoogleGenAI } from "@google/genai";',
    'import { demoEvents } from "../../backend/src/domain";',
    'import { eventICS } from "@gobbler/shared";',
    'fetch("https://provider.example/events");',
    'window.fetch("/api/events");',
    "const data = recommendations(events, profile);",
    'const socket = new WebSocket("wss://provider.example");',
    "const response: any = {};",
  ])
    assert.ok(inspect(source, "apps/frontend/app/test.tsx").length, source);
});
test("frontend boundary permits UI code and type-only contracts", () => {
  assert.deepEqual(
    inspect(
      'import React from "react"; import type { Profile } from "@gobbler/shared"; const title = "Hello";',
      "apps/frontend/app/test.tsx",
    ),
    [],
  );
});
test("shared code cannot hide executable business rules", () => {
  assert.ok(
    inspect(
      "export function score() { return 10; }",
      "packages/shared/src/hidden.ts",
    ).length,
  );
  assert.deepEqual(
    inspect(
      "export interface Example { id: string; optional?: string }",
      "packages/shared/src/types.ts",
    ),
    [],
  );
});
test("backend domains cannot reach frontend or arbitrary sibling modules", () => {
  assert.ok(
    inspect(
      'import { app } from "../../frontend/app/index";',
      "apps/backend/src/domain.ts",
    ).length,
  );
  assert.ok(
    inspect('import { db } from "./store.js";', "apps/backend/src/domain.ts")
      .length,
  );
});
