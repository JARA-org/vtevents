import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, EXPO_PUBLIC_PREVIEW_ONLY: "true" },
  },
);
process.exit(result.status || 0);
