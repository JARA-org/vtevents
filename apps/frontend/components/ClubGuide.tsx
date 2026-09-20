import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Gobbler, Pressable } from "./ui";
import { C, font } from "./theme";

/** Static product documentation for club representatives. Presentation only: no
 * provider calls, no domain decisions, and no publication rules
 * evaluated here. Every behaviour described is enforced by the backend. */
type Step = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string[];
  commands?: { label: string; note: string }[];
};

const steps: Step[] = [
  {
    icon: "person-add-outline",
    title: "Before you start",
    body: [
      "You need Manage Server permission in your Discord server and a My Gobbler website account. Any student account works — you create the club workspace during setup.",
      "In the channels you want read, the Gobbler bot needs View Channel and Read Message History. Nothing else.",
      "Gobbler never changes your server. It does not touch channels, roles, permissions or messages, and it never posts on its own.",
    ],
  },
  {
    icon: "add-circle-outline",
    title: "1. Add the Gobbler bot",
    body: [
      "A server admin installs the bot once. Ask the My Gobbler team for the install link — we do not publish it here, so nobody can add a look-alike bot to your server.",
    ],
  },
  {
    icon: "link-outline",
    title: "2. Link the server to your club",
    body: [
      "Run the setup command in any channel. Gobbler replies privately with a link that works for ten minutes and only for you — treat it like a password and do not share it.",
      "The link takes you to sign-in, then to a short club form. Submitting that form binds this Discord server to your club. Each website account can create one club workspace.",
    ],
    commands: [
      { label: "/gobbler setup", note: "private reply with your ten-minute setup link" },
    ],
  },
  {
    icon: "eye-outline",
    title: "3. Choose what Gobbler may read",
    body: [
      "Watching a channel reads its new messages as public input. Turning it on never reaches back into earlier history.",
      "You can also submit one message at a time from any channel the bot can read, including an older post: right-click the message, open Apps, choose Submit to Gobbler (public).",
      "Use either, both or neither. Opt-outs always win over both.",
    ],
    commands: [
      { label: "/gobbler watch public:true", note: "read this channel's new announcements" },
      { label: "Submit to Gobbler (public)", note: "right-click one message → Apps" },
    ],
  },
  {
    icon: "megaphone-outline",
    title: "4. Write an announcement it can publish",
    body: [
      "Include a date it can pin down. “tonight”, “next Friday” and “October 3” all work — it reads them against the moment you posted, in Blacksburg time. A date it cannot resolve confidently is left unpublished rather than guessed.",
      "Include a place: a physical venue, or say it is online. A Zoom or Meet link counts as an online venue.",
      "The title and description come from your own words — Gobbler quotes you rather than writing its own copy.",
      "Times are optional. A clear range like “6:00 PM – 8:00 PM” is used as-is. Without one, the event publishes with its time marked to be confirmed instead of an invented start.",
      "Flyers count too: PNG, JPEG or WebP attachments, up to three per announcement and 4 MB each. An image-only post can work on its own.",
    ],
    commands: [
      {
        label: "/gobbler append announcement:<link> message:<link>",
        note: "combine up to eight messages in one channel into a single announcement",
      },
    ],
  },
  {
    icon: "rocket-outline",
    title: "5. It publishes by itself",
    body: [
      "There is no approval queue. A qualifying announcement appears in campus discovery and on your club page, and later edits to the Discord message follow it.",
      "If several announcements land at once, later ones wait their turn: each server gets five extractions an hour and twenty a day, shared between new posts and edits.",
    ],
  },
  {
    icon: "mail-outline",
    title: "6. We email the club owner",
    body: [
      "Every time a new announcement publishes, the website account that owns the club gets an email containing the original announcement, any text read from your flyers, the published date and time, the physical location and online link, a link back to the original Discord message, and a link to your club workspace.",
      "Editing a message can produce a fresh email. Re-processing the same unchanged announcement never emails twice, and we never send a backlog for announcements that were already published before setup.",
      "That workspace link is not a password. It selects your club, then asks you to sign in, and ownership is checked again before anything is shown or saved.",
      "Email delivery depends on the mail provider being configured on the server. If it is not, publishing still works — you simply will not get the notification.",
    ],
  },
  {
    icon: "create-outline",
    title: "7. Fix something after it is live",
    body: [
      "Open your club workspace, sign in, find the event card and choose Edit event. You can correct the title, description, start date and time, end date and time, physical location, online link and categories.",
      "Times are Blacksburg time. Leave the end date blank for a same-day event; overnight and multi-day ranges are fine.",
      "Your correction sticks: later refreshes of the Discord source will not overwrite it, and each change is kept with an audit record.",
      "Edits change the My Gobbler listing only. They never alter your Discord message.",
    ],
  },
  {
    icon: "close-circle-outline",
    title: "8. Take something back",
    body: [
      "Put [no-ai] anywhere in a message and it is never read.",
      "Right-click a message, open Apps and choose Ignore for Gobbler to exclude it.",
      "Delete the Discord message and the published event stops appearing.",
      "Stop automatic reading with the unwatch command. Messages you submitted individually stay separate from watching.",
      "Exclusions and deletions override everything, including a correction you made. Email that has already been delivered cannot be recalled.",
    ],
    commands: [
      { label: "Ignore for Gobbler", note: "right-click one message → Apps" },
      { label: "/gobbler unwatch", note: "stop reading this channel automatically" },
    ],
  },
  {
    icon: "pulse-outline",
    title: "9. Check on it any time",
    body: [
      "Both of these reply privately, in the channel, and never spend any budget.",
    ],
    commands: [
      {
        label: "/gobbler status",
        note: "whether this channel is watched, whether the listener is connected, and today's remaining budget",
      },
      {
        label: "/gobbler recent",
        note: "the last few messages collected here and what was read from them",
      },
    ],
  },
];

const promises = [
  "We never change your channels, roles, permissions or messages.",
  "We only read channels you selected, plus messages you explicitly submit.",
  "Private Discord content never becomes part of shared campus records.",
  "Matching a name never claims your club. Ownership comes from your account and your server link.",
  "Announcement text is treated as information, never as instructions to follow.",
];

export function ClubGuide({ onBack, onWorkspace }: { onBack: () => void; onWorkspace: () => void }) {
  const { width } = useWindowDimensions();
  const mobile = width < 800;
  return (
    <View style={{ gap: mobile ? 28 : 36, maxWidth: 920, width: "100%", alignSelf: "center" }}>
      <View style={[g.hero, mobile && { flexDirection: "column", gap: 20, alignItems: "flex-start" }]}>
        <View style={{ flex: 1, gap: 14 }}>
          <View style={g.eyebrow}>
            <Ionicons accessible={false} name="logo-discord" size={15} color={C.maroon} />
            <Text style={g.eyebrowText}>FOR CLUBS</Text>
          </View>
          <Text accessibilityRole="header" style={[g.title, mobile && { fontSize: 32, lineHeight: 37 }]}>
            Announce it once, in Discord.
          </Text>
          <Text style={g.lead}>
            Post your event where your members already are. Gobbler reads the
            channels you pick, puts qualifying announcements in front of the rest
            of campus, and emails you when one goes live.
          </Text>
          <View style={[g.actions, mobile && { alignItems: "stretch" }]}>
            <Button label="Open my club workspace" icon="briefcase-outline" onPress={onWorkspace} />
            <Button secondary label="Back to home" onPress={onBack} />
          </View>
        </View>
        {!mobile && (
          <View style={g.art}>
            <View style={g.circle} />
            <Gobbler size={168} />
          </View>
        )}
      </View>

      <View style={{ gap: 14 }}>
        {steps.map((step) => (
          <View key={step.title} style={g.card}>
            <View style={g.cardHead}>
              <View style={g.badge}>
                <Ionicons accessible={false} name={step.icon} size={19} color={C.maroon} />
              </View>
              <Text accessibilityRole="header" aria-level={3} style={g.cardTitle}>
                {step.title}
              </Text>
            </View>
            {step.body.map((line) => (
              <Text key={line} style={g.body}>
                {line}
              </Text>
            ))}
            {step.commands?.map((command) => (
              <View key={command.label} style={g.command}>
                <Text style={g.commandLabel}>{command.label}</Text>
                <Text style={g.commandNote}>{command.note}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={g.promise}>
        <Text accessibilityRole="header" aria-level={3} style={g.promiseTitle}>
          What Gobbler will never do
        </Text>
        {promises.map((line) => (
          <View key={line} style={g.promiseRow}>
            <Ionicons accessible={false} name="shield-checkmark-outline" size={17} color={C.maroon} />
            <Text style={[g.body, { flex: 1 }]}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 12, alignItems: mobile ? "stretch" : "flex-start" }}>
        <Text style={g.body}>
          Stuck on a step, or need the bot install link? Ask the My Gobbler team.
        </Text>
        <Pressable accessibilityRole="button" onPress={onWorkspace} style={g.inlineLink}>
          <Text style={g.inlineLinkText}>Go to my club workspace</Text>
          <Ionicons accessible={false} name="arrow-forward" size={16} color={C.maroon} />
        </Pressable>
        <Text style={g.fine}>
          My Gobbler is student-built and is not affiliated with or endorsed by
          Virginia Tech or Discord.
        </Text>
      </View>
    </View>
  );
}

const g = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 28,
    backgroundColor: C.cream,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.line,
    padding: 28,
  },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrowText: {
    fontFamily: font,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: C.maroon,
  },
  title: {
    fontFamily: font,
    fontSize: 40,
    lineHeight: 45,
    fontWeight: "900",
    letterSpacing: -1.2,
    color: C.ink,
  },
  lead: { fontFamily: font, fontSize: 17, lineHeight: 27, color: C.muted },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  art: { width: 210, height: 210, alignItems: "center", justifyContent: "center" },
  circle: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: C.pink,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    padding: 22,
    gap: 10,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    fontFamily: font,
    fontSize: 20,
    fontWeight: "800",
    color: C.maroon,
    letterSpacing: -0.4,
  },
  body: { fontFamily: font, fontSize: 15.5, lineHeight: 25, color: C.ink },
  command: {
    backgroundColor: C.paper,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 3,
  },
  commandLabel: {
    fontFamily: font,
    fontSize: 15,
    fontWeight: "800",
    color: C.burgundy,
  },
  commandNote: { fontFamily: font, fontSize: 14, color: C.muted },
  promise: {
    backgroundColor: C.pink,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    padding: 22,
    gap: 10,
  },
  promiseTitle: {
    fontFamily: font,
    fontSize: 20,
    fontWeight: "800",
    color: C.maroon,
    letterSpacing: -0.4,
  },
  promiseRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  inlineLink: { flexDirection: "row", alignItems: "center", gap: 8 },
  inlineLinkText: {
    fontFamily: font,
    fontSize: 16,
    fontWeight: "800",
    color: C.maroon,
    textDecorationLine: "underline",
  },
  fine: { fontFamily: font, fontSize: 13, lineHeight: 21, color: C.muted },
});
