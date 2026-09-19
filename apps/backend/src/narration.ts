import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { CampusEvent, CAMPUS_TZ } from "../../../packages/shared/src/index.js";
import { database } from "./store.js";
import { HttpError } from "./config.js";

export const voiceReady = () =>
  !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
// Narration never receives a student's question, identity, interests or schedule.
export function narrationText(events: CampusEvent[]) {
  if (
    !events.length ||
    events.length > 3 ||
    events.some((e) => e.mode !== "live" || e.status === "cancelled")
  )
    throw new HttpError(
      400,
      "Choose up to three current campus events to hear.",
    );
  const plain = (value: string) =>
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/[\[\]<>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return (
    "Hi, I'm Gobbler, your little guide to campus life. Here are some campus options. " +
    events
      .map((e) => {
        const when = DateTime.fromISO(e.start)
          .setZone(CAMPUS_TZ)
          .toFormat(
            e.allDay || e.timeTBD
              ? "cccc, LLLL d"
              : "cccc, LLLL d, 'at' h:mm a ZZZZ",
          );
        return `${plain(e.title).slice(0, 140)}. ${when}${e.timeTBD ? ", time to be announced" : e.allDay ? ", all day" : ""}. ${e.location ? "Location: " + plain(e.location).slice(0, 140) + "." : "Location not provided."}`;
      })
      .join(" ") +
    " Check each event's source and schedule note before making plans."
  );
}

export async function narrate(events: CampusEvent[]) {
  if (!voiceReady())
    throw new HttpError(503, "ElevenLabs narration is not connected yet.");
  const text = narrationText(events),
    voice = process.env.ELEVENLABS_VOICE_ID!;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(voice))
    throw new HttpError(503, "Narration voice configuration is unavailable.");
  const key = createHash("sha256")
    .update(voice + "\n" + text)
    .digest("hex");
  const cache = database().collection("voice_cache");
  const cached = await cache.findOne({ key, expiresAt: { $gt: new Date() } });
  if (cached) return Buffer.from(cached.audio.buffer);
  // A short DB lease coalesces concurrent clicks across backend instances.
  const locks = database().collection("voice_locks");
  try {
    await locks.insertOne({ key, expiresAt: new Date(Date.now() + 60000) });
  } catch (error: any) {
    if (error.code === 11000)
      throw new HttpError(
        409,
        "Gobbler is preparing this audio. Try again in a moment.",
      );
    throw error;
  }
  try {
    const rawLimit = Number(
      process.env.ELEVENLABS_MONTHLY_CHARACTER_LIMIT || 8000,
    );
    const limit =
      Number.isSafeInteger(rawLimit) && rawLimit >= 0
        ? Math.min(rawLimit, 8000)
        : 0;
    const month = new Date().toISOString().slice(0, 7);
    // Reserve before sending. Ambiguous failures keep their reservation: never retry a billable request.
    const budget = await database()
      .collection("voice_budget")
      .findOneAndUpdate(
        { month },
        { $inc: { characters: text.length } },
        { upsert: true, returnDocument: "after" },
      );
    if (!budget || budget.characters > limit)
      throw new HttpError(
        429,
        "Gobbler has used this month's voice allowance. You can still read every recommendation.",
      );
    let response: Response;
    try {
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(25000),
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY!,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
        },
      );
    } catch {
      throw new HttpError(
        502,
        "Gobbler's voice is unavailable right now. The written recommendations are still here.",
      );
    }
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("audio/")
    )
      throw new HttpError(
        502,
        "Gobbler's voice is unavailable right now. The written recommendations are still here.",
      );
    // Enforce a response size bound while reading, not after allocating arbitrary bytes.
    const reader = response.body?.getReader();
    if (!reader)
      throw new HttpError(502, "The voice provider returned no audio.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4_000_000) {
        await reader.cancel();
        throw new HttpError(502, "The audio response was too large.");
      }
      chunks.push(value);
    }
    if (!length)
      throw new HttpError(502, "The voice provider returned no audio.");
    const audio = Buffer.concat(chunks);
    await cache.updateOne(
      { key },
      { $set: { audio, expiresAt: new Date(Date.now() + 86400000) } },
      { upsert: true },
    );
    return audio;
  } finally {
    await locks.deleteOne({ key });
  }
}
