import { refreshSources } from "./coordinator.js";
let pending: Promise<void> | undefined;
export function runJobs() {
  if (pending) return pending;
  pending = (async () => {
    await refreshSources();
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
