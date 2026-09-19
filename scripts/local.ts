import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
// Local-only development convenience. Production always uses MONGODB_URI / Atlas.
await mkdir("work/local-mongo", { recursive: true });
let secrets: any;
try {
  secrets = JSON.parse(await readFile("work/local-secrets.json", "utf8"));
} catch {
  secrets = {
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    ANALYTICS_SALT: randomBytes(32).toString("hex"),
  };
  await writeFile("work/local-secrets.json", JSON.stringify(secrets), {
    mode: 0o600,
  });
}
for (const [k, v] of Object.entries(secrets)) process.env[k] ||= String(v);
let local: MongoMemoryReplSet | undefined;
if (!process.env.MONGODB_URI) {
  // Replica-set membership persists with the data: reuse its original port.
  let port = 27027;
  try {
    port = Number(await readFile("work/local-mongo-port", "utf8"));
  } catch {}
  local = await MongoMemoryReplSet.create({
    instanceOpts: [{ dbPath: "work/local-mongo", port }],
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await writeFile(
    "work/local-mongo-port",
    String(local.servers[0].instanceInfo!.port),
  );
  process.env.MONGODB_URI = local.getUri();
  console.log(
    "Local development database ready. Production Atlas is not configured.",
  );
}
process.on("SIGINT", () => {
  void local?.stop().finally(() => process.exit(0));
});
await import("../apps/backend/src/server.js");
