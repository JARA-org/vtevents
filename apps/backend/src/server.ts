import { connectDB } from "./store.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { runJobs } from "./jobs.js";
import { flushAccountEmail } from "./account-email.js";
import { clubPublicationNotifications } from "./club-publication-email.js";
import { startDiscordCollection } from "./discord-jobs.js";
import { startAnsRuntime } from "./ans-runtime.js";
import { monitorEventLoopDelay } from "node:perf_hooks";
// Numeric process metrics only: no URLs, user context, credentials or event text.
const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();
let previousCpu = process.cpuUsage(), previousTime = Date.now();
setInterval(() => {
  const now = Date.now(), cpu = process.cpuUsage(), memory = process.memoryUsage();
  console.log("runtime_performance", JSON.stringify({
    rssMB: Math.round(memory.rss / 1048576),
    heapMB: Math.round(memory.heapUsed / 1048576),
    cpuPercent: Math.round((cpu.user + cpu.system - previousCpu.user - previousCpu.system) / ((now - previousTime) * 10)),
    eventLoopP99Ms: Math.round(lag.percentile(99) / 1e6),
    eventLoopMaxMs: Math.round(lag.max / 1e6),
  }));
  previousCpu = cpu;
  previousTime = now;
  lag.reset();
}, 60000).unref();
await connectDB();
const app = createApp();
const stopAns = process.env.ANS_DIRECTORY ? await startAnsRuntime(process.env.ANS_DIRECTORY, app) : undefined;
if (stopAns) console.log("ans_runtime_ready", { coordinator: true, assistant: true });
app.listen(config.port, "0.0.0.0", () =>
  console.log(`My Gobbler listening on ${config.port}`),
);
const background = (job: () => Promise<void>, name: string) => {
  void job().catch(() => console.warn("background_job_failed", { job: name }));
};
background(runJobs, "refresh");
const stopDiscord = startDiscordCollection();
process.once("SIGTERM", () => {
  void Promise.all([stopDiscord(), stopAns?.()]).finally(() => process.exit(0));
});
setInterval(() => background(runJobs, "refresh"), 60000).unref();
setInterval(
  () => background(flushAccountEmail, "account-email"),
  10000,
).unref();
setInterval(() => background(() => clubPublicationNotifications.flush(), "club-publication-email"), 10000).unref();
