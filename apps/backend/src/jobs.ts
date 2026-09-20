import { refreshSources } from "./coordinator.js";
import { flushAnalytics } from "./analytics.js";
let pending: Promise<void> | undefined;
export function runJobs() {
  if (pending) return pending;
  pending = (async () => {
    await refreshSources();
    await flushAnalytics();
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
