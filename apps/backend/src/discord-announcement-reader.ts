import type {
  DiscordAnnouncementRepository,
  DiscordBotRepository,
  DiscordMessageReader,
} from "../../../packages/shared/src/contracts.js";

/** Worker-only adapter over explicit membership. GETs at most eight selected messages;
 * any missing/excluded source withholds the whole announcement. Never reads neighboring history.
 * No database writes or model calls. Provider failures propagate for queue retry.
 */
export function createAnnouncementReader(
  reader: DiscordMessageReader,
  groups: DiscordAnnouncementRepository,
  policy: DiscordBotRepository,
): DiscordMessageReader {
  return {
    list: (target, before) => reader.list(target, before),
    images: reader.images?.bind(reader),
    async get(target) {
      const root = await groups.root(target);
      if (root.messageId !== target.messageId) return null;
      const group = await groups.members(target);
      if (!group.revision) return reader.get(target);
      const messages = [];
      for (const messageId of group.messageIds) {
        const source = { ...target, messageId };
        if (!(await policy.eligible(source))) return null;
        const message = await reader.get(source);
        if (!message || /\[no-ai\]/i.test(message.text)) return null;
        messages.push(message);
      }
      const first = messages.find((m) => m.messageId === root.messageId);
      if (!first) return null;
      return {
        ...first,
        text: messages.map((m) => m.text).join("\n\n"),
        images: messages.flatMap((m) => m.images || []),
        parts: messages.map(({ messageId, text, createdAt, sourceUrl }) => ({
          messageId,
          text,
          createdAt,
          sourceUrl,
        })),
        groupRevision: group.revision,
      };
    },
  };
}
