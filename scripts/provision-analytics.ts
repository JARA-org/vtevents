import "dotenv/config";
import { initializeAnalytics } from "../apps/backend/src/analytics.js";
await initializeAnalytics();
console.log(
  "Databricks interaction table is ready. Dashboard queries: docs/analytics.sql",
);
