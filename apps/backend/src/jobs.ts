import { refreshSources, liveEvents } from "./coordinator.js";
import { semanticSearch } from "./semantic-runtime.js";
let pending: Promise<void> | undefined;
export function runJobs() {
  if (pending) return pending;
  pending = (async () => {
    await refreshSources();
    await semanticSearch.index(liveEvents());
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
