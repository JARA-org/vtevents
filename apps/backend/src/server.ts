import { connectDB } from "./store.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { runJobs } from "./jobs.js";
import { flushAnalytics } from "./analytics.js";
import { startDiscordCollection } from "./discord-jobs.js";
await connectDB();
createApp().listen(config.port, "0.0.0.0", () =>
  console.log(`My Little Gobbler listening on ${config.port}`),
);
const background = (job: () => Promise<void>, name: string) => {
  void job().catch(() => console.warn("background_job_failed", { job: name }));
};
background(runJobs, "refresh");
const stopDiscord = startDiscordCollection();
process.once("SIGTERM", () => {
  void stopDiscord().finally(() => process.exit(0));
});
setInterval(() => background(runJobs, "refresh"), 3600000).unref();
setInterval(() => background(flushAnalytics, "analytics"), 60000).unref();
