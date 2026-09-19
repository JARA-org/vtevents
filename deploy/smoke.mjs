import { smokeDeployment } from "./lib/smoke.mjs";

// Operator CLI: explicit origin only; read-only HTTP, no provisioning or account creation.
// Nonzero exit on any failed check; safe to rerun, no automatic retry or transaction.
try {
  const results = await smokeDeployment(process.argv[2]);
  for (const result of results)
    console.log(
      `${result.ok ? "PASS" : "FAIL"} ${result.path}: ${result.message}`,
    );
  process.exitCode = results.every((result) => result.ok) ? 0 : 1;
} catch {
  console.error("Usage: node deploy/smoke.mjs https://YOUR_HOSTNAME");
  process.exitCode = 1;
}
