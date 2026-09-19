# Genie One MCP setup status

The owner requested Genie One MCP for Databricks work. Workspace: `https://dbc-4490568c-354b.cloud.databricks.com` (Free Edition, `surlezrulez@gmail.com`).

The supported endpoint is `https://dbc-4490568c-354b.cloud.databricks.com/api/2.0/mcp/genie`. The server is **not connected** and no tools have been called successfully.

Verified blockers on 2026-09-19:

- The Databricks console explicitly reports that it does not support automated browser control. Do not bypass that restriction.
- The plugin catalog finds “Databricks Genie,” but installation suggestion returns “not eligible” in this workspace. This is an installation availability issue, not a claimed account permission denial.
- A direct `codex mcp add ... --url .../api/2.0/mcp/genie` attempt saved configuration but OAuth failed: **Dynamic client registration not supported**. The incomplete global entry was removed to avoid broken startup configuration.
- Official documentation requires enabling the **Managed MCP Servers** workspace preview and authenticating. Direct OAuth needs a pre-registered OAuth application with the `genie` scope. Databricks recommends its Unity Gateway CLI for coding agents, which uses the personal Databricks CLI OAuth login and does not require a custom client.
- Official Databricks CLI v1.17.0 was downloaded from `databricks/cli`, checksum verified, and placed in ignored `work/databricks-cli`. The workspace login reached personal consent for All APIs and longer-running access. It was cancelled when the owner requested the MCP route; no completed CLI credential exists yet.

To finish, have the owner personally enable the workspace preview if needed and complete the Databricks OAuth consent. Use the official Unity Gateway CLI's **MCP-only** setup to connect Genie One to Codex; do not change the user's coding-model provider or route model traffic through Databricks. Alternatively, configure a registered OAuth client or a supported private token in secret storage. Never put token values in this file or chat. Verify discovered tools and actual query success before claiming connection.

Genie One is for natural-language analysis over authorized data. The application's reliable analytics ingestion remains the Node SQL Statement Execution API with Mongo outbox; a Genie connection alone does not configure ingestion or a dashboard. Run `scripts/provision-analytics.ts` only after supplying working workspace/warehouse credentials, exercise ingestion and erasure, then create and inspect the dashboard from `docs/analytics.sql`.

Sources: [Genie One MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp), [client authentication and gateway integration](https://docs.databricks.com/aws/en/agents/mcp-tools/connect-clients), [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
