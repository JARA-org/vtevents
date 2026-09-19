import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const version of [1, 2]) {
  const path = resolve(
    root,
    version === 1
      ? "packages/shared/src/legacy/contracts-v1.ts"
      : "packages/shared/src/contracts.ts",
  );
  const baseline = resolve(root, `tests/fixtures/contracts-v${version}.json`);
  const program = ts.createProgram([path], {
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  });
  const checker = program.getTypeChecker();
  const tree = program.getSourceFile(path);
  const current = {};
  for (const node of tree.statements) {
    if (ts.isInterfaceDeclaration(node)) {
      current[node.name.text] = {
        kind: "interface",
        heritage:
          node.heritageClauses?.map((c) =>
            c.getText(tree).replace(/\s+/g, " "),
          ) || [],
        members: {},
      };
      for (const member of node.members) {
        const key = member.name?.getText(tree);
        if (key)
          current[node.name.text].members[key] = {
            optional: !!member.questionToken,
            type: checker.typeToString(
              checker.getTypeAtLocation(member),
              undefined,
              ts.TypeFormatFlags.NoTruncation,
            ),
          };
      }
    } else if (ts.isTypeAliasDeclaration(node))
      current[node.name.text] = {
        kind: "alias",
        type: ts
          .createPrinter({ removeComments: true })
          .printNode(ts.EmitHint.Unspecified, node.type, tree),
      };
  }
  if (version === 2 && process.argv.includes("--initialize-v2")) {
    // Initialization only. Never overwrite a committed baseline.
    writeFileSync(baseline, JSON.stringify(current, null, 2) + "\n", {
      flag: "wx",
    });
    console.log("Initialized immutable v2 contract baseline.");
  } else {
    const old = JSON.parse(readFileSync(baseline, "utf8"));
    const failures = [];
    for (const [name, definition] of Object.entries(old)) {
      const next = current[name];
      if (!next || next.kind !== definition.kind) {
        failures.push(`${name} removed or changed kind`);
        continue;
      }
      if (definition.kind === "alias") {
        if (next.type !== definition.type) failures.push(`${name} changed`);
        continue;
      }
      if (JSON.stringify(next.heritage) !== JSON.stringify(definition.heritage))
        failures.push(`${name} changed inherited fields`);
      for (const [key, member] of Object.entries(definition.members))
        if (JSON.stringify(next.members[key]) !== JSON.stringify(member))
          failures.push(`${name}.${key} removed or changed`);
      // Functions/ports can acquire new operations; DTOs may only acquire optional fields.
      const operations =
        name === "HttpApi" ||
        name.endsWith("Service") ||
        name.endsWith("Services") ||
        name.endsWith("Repository") ||
        ["BackendModules", "SourceAdapter", "EventRepository"].includes(name);
      for (const [key, member] of Object.entries(next.members))
        if (!(key in definition.members) && !member.optional && !operations)
          failures.push(`${name}.${key} adds a required data field`);
    }
    if (failures.length) {
      console.error(failures.join("\n"));
      process.exitCode = 1;
    } else console.log(`v${version} contract compatibility passed.`);
  }
}
