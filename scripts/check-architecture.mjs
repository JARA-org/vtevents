import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const slash = (s) => s.replaceAll("\\", "/");
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? ["node_modules", "dist", ".expo", "public", "assets"].includes(e.name)
        ? []
        : files(resolve(dir, e.name))
      : /\.[cm]?[jt]sx?$/.test(e.name)
        ? [resolve(dir, e.name)]
        : [],
  );
}
// Explicit current dependencies. New modules need an owner/port and reviewed edges.
const edges = {
  "club-accounts.ts": ["store", "config"],
  "discord-publication.ts": [
    "discord-announcements",
    "store",
    "config",
    "domain",
    "discord-event-rules",
    "discord-bot-store",
  ],
  "app.ts": [
    "account-email",
    "discord-publication",
    "club-accounts",
    "domain",
    "discovery",
    "config",
    "store",
    "coordinator",
    "assistant",
    "analytics",
    "integrations",
    "jobs",
    "security",
    "narration",
    "discord-bot-http",
  ],
  "server.ts": [
    "store",
    "app",
    "config",
    "jobs",
    "analytics",
    "discord-jobs",
    "account-email",
  ],
  "account-email.ts": ["store", "config", "security"],
  "domain.ts": [],
  "config.ts": [],
  "security.ts": [],
  "store.ts": ["config"],
  "sources.ts": ["domain", "security", "config"],
  "coordinator.ts": ["domain", "store", "sources", "security"],
  "discovery.ts": ["domain", "config"],
  "assistant.ts": ["domain", "store"],
  "integrations.ts": ["domain", "config", "store", "security", "analytics"],
  "discord-limits.ts": [],
  "discord-gateway.ts": [],
  "discord-trigger-store.ts": ["store", "discord-bot-store"],
  "discord-jobs.ts": [
    "discord-announcements",
    "discord-announcement-reader",
    "discord-gateway",
    "discord-trigger-store",
    "discord-limits",
    "store",
    "discord-bot-store",
    "discord-collection-store",
    "discord-reader",
    "discord-extractor",
    "discord-collector",
  ],
  "discord-collector.ts": [
    "discord-bot",
    "discord-event-rules",
    "discord-reader",
  ],
  "discord-reader.ts": ["discord-images"],
  "discord-images.ts": [],
  "discord-announcements.ts": ["store", "club-accounts"],
  "discord-announcement-reader.ts": [],
  "discord-event-rules.ts": [],
  "discord-extractor.ts": [],
  "discord-collection-store.ts": [
    "discord-announcements",
    "club-accounts",
    "store",
    "discord-limits",
    "discord-bot-store",
  ],
  "discord-bot.ts": [],
  "discord-bot-store.ts": ["store", "club-accounts", "discord-announcements"],
  "discord-bot-http.ts": [
    "club-accounts",
    "discord-bot",
    "discord-bot-store",
    "discord-collection-store",
  ],
  "narration.ts": ["domain", "store", "config"],
  "analytics.ts": ["store", "security", "config"],
  "jobs.ts": ["store", "integrations", "coordinator", "analytics"],
  "contract-check.ts": [
    "narration",
    "domain",
    "coordinator",
    "sources",
    "assistant",
    "discovery",
    "integrations",
    "analytics",
    "jobs",
  ],
};
const uiPackages =
  /^(react(?:-native)?(?:\/|$)|expo(?:[-/]|$)|@expo\/|@react-navigation\/|luxon$)/;
const forbiddenLogic = new Set([
  "recommendations",
  "scheduleFit",
  "eventICS",
  "demoEvents",
  "questionFilter",
  "filterQuestion",
  "normalizeICS",
  "deduplicate",
  "reconcileEvents",
  "parseSports",
]);
export function inspect(source, name) {
  const problems = [];
  const frontend = name.startsWith("apps/frontend/");
  const shared = name.startsWith("packages/shared/");
  const backend = name.startsWith("apps/backend/src/");
  const tree = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const fail = (node, message) =>
    problems.push(
      `${name}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: ${message}`,
    );
  if (shared)
    for (const node of tree.statements) {
      if (!(
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
        (ts.isExportDeclaration(node) && node.isTypeOnly)
      ))
        fail(node, "Shared package must contain types only.");
    }
  function checkImport(node, spec, typeOnly) {
    if (frontend) {
      if (spec.startsWith("@gobbler/shared")) {
        if (!typeOnly) fail(node, "Shared imports must use import type.");
      } else if (spec.startsWith(".")) {
        const target = slash(
          relative(root, resolve(root, dirname(name), spec)),
        );
        if (!target.startsWith("apps/frontend/"))
          fail(
            node,
            "Frontend cannot import outside its UI tree; use shared types or backend client.",
          );
      } else if (!uiPackages.test(spec))
        fail(node, `Non-UI dependency ${spec} is forbidden in frontend.`);
    }
    if (backend && spec.startsWith(".")) {
      const target = slash(relative(root, resolve(root, dirname(name), spec)));
      if (target.startsWith("apps/backend/src/")) {
        const dependency = basename(spec).replace(/\.[cm]?[jt]sx?$/, "");
        if (!edges[basename(name)]?.includes(dependency))
          fail(
            node,
            `Undeclared backend dependency ${dependency}; define/review its port.`,
          );
      } else if (!target.startsWith("packages/shared/"))
        fail(
          node,
          "Backend cannot import frontend or unrelated implementations.",
        );
    }
  }
  function visit(node) {
    if (frontend && node.kind === ts.SyntaxKind.AnyKeyword)
      fail(
        node,
        "Frontend must use declared contract/UI types instead of any.",
      );
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      checkImport(
        node,
        node.moduleSpecifier.text,
        !!(node.isTypeOnly || node.importClause?.isTypeOnly),
      );
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(tree);
      if (
        (callee === "require" ||
          node.expression.kind === ts.SyntaxKind.ImportKeyword) &&
        frontend
      ) {
        const spec = node.arguments[0];
        if (!spec || !ts.isStringLiteral(spec))
          fail(node, "Dynamic module paths bypass boundaries.");
        else if (!/\.(png|jpg|svg|webp)$/.test(spec.text))
          checkImport(node, spec.text, false);
      }
      if (frontend && forbiddenLogic.has(callee))
        fail(node, `Business operation ${callee} belongs in backend.`);
      if (frontend && /^(?:(?:globalThis|window)\.)?fetch$/.test(callee)) {
        if (name !== "apps/frontend/services/backend.ts")
          fail(node, "Only the typed backend transport may fetch.");
        else if (node.arguments[0]?.getText(tree) !== '"/api" + path')
          fail(
            node,
            "Frontend transport must target same-origin backend /api only.",
          );
      }
    }
    if (
      frontend &&
      ts.isIdentifier(node) &&
      ["XMLHttpRequest", "WebSocket", "EventSource"].includes(node.text)
    )
      fail(
        node,
        "Network access belongs in an explicit backend transport contract.",
      );
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return problems;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const problems = [
    "apps/frontend",
    "apps/backend/src",
    "packages/shared/src",
  ].flatMap((dir) =>
    files(resolve(root, dir)).flatMap((file) =>
      inspect(readFileSync(file, "utf8"), slash(relative(root, file))),
    ),
  );
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else console.log("Architecture boundaries passed.");
}
