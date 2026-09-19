import { connectDB } from "./store.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { runJobs } from "./jobs.js";
import { flushAnalytics } from "./analytics.js";
await connectDB();
createApp().listen(config.port, "0.0.0.0", () =>
  console.log(`My Little Gobbler listening on ${config.port}`),
);
void runJobs();
setInterval(() => void runJobs(), 3600000).unref();
setInterval(() => void flushAnalytics(), 60000).unref();
