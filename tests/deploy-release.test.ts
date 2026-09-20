import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const available = spawnSync(bash, ["--version"]).status === 0;
const posix = (path: string) => path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

test("Vultr release preserves settings and rolls back failed replacement or smoke checks", { skip: !available }, () => {
  const root = mkdtempSync(join(tmpdir(), "gobbler-release-"));
  try {
    for (const scenario of ["success", "preflight", "health", "smoke", "rollback", "restart"]) {
      const dir = join(root, scenario);
      mkdirSync(dir, { recursive: true });
      const shellRoot = posix(dir);
      const releaseId = `${"a".repeat(40)}-123-1`;
      const script = readFileSync("deploy/remote-release.sh", "utf8")
        .replaceAll("/opt/", `${shellRoot}/opt/`)
        .replaceAll("/var/lock/", `${shellRoot}/lock/`);
      writeFileSync(join(dir, "release.sh"), script);
      const driver = `set -euo pipefail
cd ${quote(shellRoot)}
mkdir -p bin lock opt/old/deploy opt/gobbler-incoming/${releaseId} bundle/deploy
printf 'production-secret-stays-on-host\\nELEVENLABS_API_KEY=retired-test-key\\nELEVENLABS_VOICE_ID=retired-voice\\n' > opt/old/.env.production
touch opt/old/deploy/compose.yaml bundle/deploy/compose.yaml bundle/image.tar.gz
tar -czf opt/gobbler-incoming/${releaseId}/release.tar.gz -C bundle .
cat > bin/id <<'STUB'
#!/usr/bin/env bash
echo 0
STUB
cat > bin/flock <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > bin/sleep <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > bin/docker <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$TEST_ROOT/calls"
case "$1" in
  ps) echo old-container ;;
  inspect)
    if [[ "$3" == *RestartCount* ]]; then
      if [[ "$SCENARIO" == restart ]]; then echo 'running healthy 1 false'; else echo 'running healthy 0 false'; fi
      exit 0
    fi
    if [[ "$3" == *Config.Image* ]]; then echo old-image; else echo "$TEST_ROOT/opt/old/deploy/compose.yaml"; fi ;;
  run)
    if [[ "$*" == *preflight.mjs* && "$SCENARIO" == preflight ]]; then exit 1; fi
    if [[ "$*" == *smoke.mjs* && "$SCENARIO" == smoke ]]; then exit 1; fi ;;
  compose)
    if [[ "$*" == *" ps -q app"* ]]; then echo candidate; fi
    if [[ "$*" == *" up "* ]]; then
      if [[ "$*" == *"/opt/old/"* ]]; then
        [[ "$SCENARIO" != rollback ]] || exit 1
      elif [[ "$SCENARIO" == health || "$SCENARIO" == rollback ]]; then exit 1; fi
    fi ;;
esac
exit 0
STUB
chmod +x bin/*
export PATH="$PWD/bin:$PATH" TEST_ROOT="$PWD" SCENARIO=${scenario}
bash release.sh ${releaseId}
`;
      writeFileSync(join(dir, "driver.sh"), driver);
      const result = spawnSync(bash, [posix(join(dir, "driver.sh"))], { encoding: "utf8" });
      assert.equal(result.status === 0, scenario === "success", result.stderr);
      const calls = readFileSync(join(dir, "calls"), "utf8");
      assert.equal(calls.includes("/opt/old/deploy/compose.yaml up"), ["health", "smoke", "rollback", "restart"].includes(scenario));
      if (scenario === "preflight") assert.ok(!calls.includes(" up "));
      assert.ok(!calls.includes("down") && !calls.includes(" caddy"));
      assert.equal(readFileSync(join(dir, "opt/old/.env.production"), "utf8"), "production-secret-stays-on-host\nELEVENLABS_API_KEY=retired-test-key\nELEVENLABS_VOICE_ID=retired-voice\n");
      assert.equal(readFileSync(join(dir, `opt/gobbler-releases/${releaseId}/.env.production`), "utf8"), "production-secret-stays-on-host\n");
      assert.equal(existsSync(join(dir, `opt/gobbler-releases/${releaseId}/DEPLOYED`)), scenario === "success");
      if (scenario === "rollback") assert.match(result.stderr, /Rollback failed/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
