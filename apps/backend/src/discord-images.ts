import type {
  DiscordImageAttachment,
  DiscordImageData,
} from "../../../packages/shared/src/contracts.js";

/** Validates provider attachment descriptors without I/O. Signed URL query is transport-only;
 * only Discord CDN attachment paths for this channel/attachment qualify. */
export function validDiscordImage(image: DiscordImageAttachment): boolean {
  try {
    const u = new URL(image.url);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      ["cdn.discordapp.com", "media.discordapp.net"].includes(u.hostname) &&
      /^\d{1,20}$/.test(image.channelId) &&
      /^\d{1,20}$/.test(image.id) &&
      u.pathname.startsWith(`/attachments/${image.channelId}/${image.id}/`) &&
      ["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) &&
      Number.isInteger(image.size) &&
      image.size > 0 &&
      image.size <= 4 * 1024 * 1024
    );
  } catch {
    return false;
  }
}

/** Worker-only bounded CDN GETs. No credentials, redirects, embedded URLs or disk writes.
 * Returns transient model bytes; rejects >3 images, >4 MiB each, bad types/magic or network errors.
 * No retries or model calls; caller owns budget reservation and error reporting. */
export async function downloadDiscordImages(
  images: DiscordImageAttachment[],
  transport: typeof fetch = fetch,
): Promise<DiscordImageData[]> {
  if (images.length > 3 || images.some((i) => !validDiscordImage(i)))
    throw new Error("Unsupported image attachments");
  const result: DiscordImageData[] = [];
  for (const image of images) {
    const r = await transport(image.url, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (
      !r.ok ||
      r.headers.get("content-type")?.split(";")[0] !== image.mimeType ||
      Number(r.headers.get("content-length") || 0) > 4 * 1024 * 1024 ||
      !r.body
    )
      throw new Error("Image unavailable");
    const stream = r.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await stream.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4 * 1024 * 1024) throw new Error("Image too large");
        chunks.push(value);
      }
    } finally {
      await stream.cancel();
    }
    const bytes = Buffer.concat(chunks);
    const valid =
      image.mimeType === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : image.mimeType === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid) throw new Error("Invalid image content");
    result.push({
      attachmentId: image.id,
      messageId: image.messageId,
      mimeType: image.mimeType,
      data: bytes.toString("base64"),
    });
  }
  return result;
}
