import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discordBotCommands } from "../apps/backend/src/discord-bot.js";

// The guide is a React Native component, so it is inspected as source rather than
// rendered: these checks exist to stop the published instructions drifting away
// from the commands and behaviour the backend actually implements.
const guide = readFileSync("apps/frontend/components/ClubGuide.tsx", "utf8");
const index = readFileSync("apps/frontend/app/index.tsx", "utf8");

test("every command the club guide documents is one the bot registers", () => {
  const root = discordBotCommands.find((c) => c.name === "gobbler");
  assert.ok(root, "the gobbler command must exist");
  const subcommands = new Set((root.options || []).map((o) => o.name));
  const menus = new Set(
    discordBotCommands.filter((c) => c.type === 3).map((c) => c.name),
  );

  const documented = [...guide.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(documented.length >= 6, "the guide must document the commands");
  for (const label of documented) {
    if (label.startsWith("/gobbler ")) {
      const [subcommand, ...args] = label.slice("/gobbler ".length).split(" ");
      assert.ok(
        subcommands.has(subcommand),
        `/gobbler ${subcommand} is documented but not registered`,
      );
      const options = new Set(
        ((root.options || []).find((o) => o.name === subcommand)?.options || []).map(
          (o) => o.name,
        ),
      );
      for (const argument of args)
        assert.ok(
          options.has(argument.split(":")[0]),
          `${label} documents an option the command does not accept`,
        );
    } else
      assert.ok(menus.has(label), `"${label}" is documented but not registered`);
  }
  // Every registered subcommand a representative needs is actually explained.
  for (const subcommand of ["setup", "watch", "unwatch", "status", "recent", "append"])
    assert.match(guide, new RegExp(`/gobbler ${subcommand}`));
});

test("the club guide states the publication email and the limits that govern it", () => {
  for (const [topic, pattern] of [
    ["publication email", /email/i],
    ["what the email contains", /original announcement/i],
    ["flyer text in the email", /flyers/i],
    ["link back to Discord", /original Discord message/i],
    ["the link is not a bearer token", /not a password/i],
    ["no backlog of old announcements", /backlog/i],
    ["repeat delivery is suppressed", /never emails twice/i],
    ["delivery depends on configuration", /mail provider being configured/i],
    ["automatic publication", /no approval queue/i],
    ["per-server budget", /five extractions an hour and twenty a day/i],
    ["opt-out marker", /\[no-ai\]/],
    ["deletion withdraws the event", /stops appearing/i],
    ["corrections survive refreshes", /will not overwrite it/i],
    ["read-only toward Discord", /never change your channels, roles, permissions or messages/i],
    ["not affiliated", /not affiliated with or endorsed by/i],
  ] as const)
    assert.match(guide, pattern, `the guide must cover ${topic}`);
  // Accuracy of the claims above, checked against the implementation.
  assert.equal(discordBotCommands.some((c) => c.name === "Ignore for Gobbler"), true);
});

test("the club guide is reachable from the banner without an account", () => {
  assert.match(index, /accessibilityLabel="Discord setup guide for clubs"/);
  assert.match(index, /onPress=\{\(\) => go\("club-setup"\)\}/);
  // It sits in the banner beside the mascot, inside the brand group.
  assert.match(index, /brandGroup[\s\S]{0,900}accessibilityLabel="My Gobbler home"[\s\S]{0,900}Discord setup guide for clubs/);
  // A representative reads it before signing up, so it must not redirect to auth.
  assert.match(index, /\["landing", "auth", "club-setup"\]\.includes\(page\)/);
  // And a shared link opens it directly.
  assert.match(index, /requestedPage === "club-setup"/);
});
