import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { CampusEvent, Profile } from "./domain.js";
import { database } from "./store.js";
import { config, HttpError, remote } from "./config.js";
import { seal, unseal, hash } from "./security.js";
import { track } from "./analytics.js";
export type Provider = "google" | "canvas";
const canvasBase = () => {
  const u = new URL(process.env.CANVAS_BASE_URL || "https://canvas.vt.edu");
  if (u.protocol !== "https:" || u.hostname !== "canvas.vt.edu")
    throw new HttpError(
      503,
      "Canvas must use the configured Virginia Tech host",
    );
  return u.origin;
};
export function providerReady(p: Provider) {
  return !!(
    process.env.TOKEN_ENCRYPTION_KEY &&
    process.env[`${p.toUpperCase()}_CLIENT_ID`] &&
    process.env[`${p.toUpperCase()}_CLIENT_SECRET`]
  );
}
const callback = (p: Provider) =>
  `${config.origin}/api/connections/${p}/callback`;
export async function startOAuth(userId: string, p: Provider) {
  if (!providerReady(p))
    throw new HttpError(
      503,
      p === "canvas"
        ? "Canvas requires an enabled university developer key."
        : "Google Calendar OAuth is not configured yet.",
    );
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  await database()
    .collection("oauth_states")
    .insertOne({
      stateHash: hash(state),
      userId,
      provider: p,
      verifier: seal(verifier),
      expiresAt: new Date(Date.now() + 600000),
    });
  const params = new URLSearchParams({
    client_id: process.env[`${p.toUpperCase()}_CLIENT_ID`]!,
    redirect_uri: callback(p),
    response_type: "code",
    state,
  });
  if (p === "google") {
    params.set(
      "scope",
      "https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events.owned",
    );
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set(
      "code_challenge",
      Buffer.from(hash(verifier), "hex").toString("base64url"),
    );
    params.set("code_challenge_method", "S256");
  } else
    params.set(
      "scope",
      [
        "url:GET|/api/v1/users/:user_id/profile",
        "url:GET|/api/v1/courses",
        "url:GET|/api/v1/calendar_events",
        "url:GET|/api/v1/announcements",
        ...(process.env.CANVAS_WRITES_ENABLED === "true"
          ? ["url:POST|/api/v1/calendar_events"]
          : []),
      ].join(" "),
    );
  return (
    (p === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : canvasBase() + "/login/oauth2/auth") +
    "?" +
    params
  );
}
export async function finishOAuth(
  userId: string,
  p: Provider,
  state: string,
  code: string,
) {
  const row = await database()
    .collection("oauth_states")
    .findOneAndDelete({
      stateHash: hash(state),
      userId,
      provider: p,
      expiresAt: { $gt: new Date() },
    });
  if (!row)
    throw new HttpError(
      400,
      "This connection request expired. Start again from Settings.",
    );
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env[`${p.toUpperCase()}_CLIENT_ID`]!,
    client_secret: process.env[`${p.toUpperCase()}_CLIENT_SECRET`]!,
    redirect_uri: callback(p),
  });
  if (p === "google") body.set("code_verifier", unseal<string>(row.verifier));
  const t = await (
    await remote(
      p === "google"
        ? "https://oauth2.googleapis.com/token"
        : canvasBase() + "/login/oauth2/token",
      { method: "POST", body },
    )
  ).json();
  if (!t.access_token)
    throw new HttpError(502, "The connection did not return an access token.");
  await database()
    .collection("connections")
    .updateOne(
      { userId, provider: p },
      {
        $set: {
          encrypted: seal({
            ...t,
            expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
          }),
          status: "connected",
          connectedAt: new Date(),
          lastSync: null,
        },
      },
      { upsert: true },
    );
}
export async function tokenFor(userId: string, p: Provider) {
  const row = await database()
    .collection("connections")
    .findOne({ userId, provider: p });
  if (!row)
    throw new HttpError(409, "Connect this calendar in Settings first.");
  const t = unseal(row.encrypted);
  if (t.expiresAt > Date.now() + 60000) return t.access_token as string;
  if (!t.refresh_token)
    throw new HttpError(409, "Connection expired. Reconnect from Settings.");
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: t.refresh_token,
      redirect_uri: callback(p),
      client_id: process.env[`${p.toUpperCase()}_CLIENT_ID`]!,
      client_secret: process.env[`${p.toUpperCase()}_CLIENT_SECRET`]!,
    });
    const fresh = await (
      await remote(
        p === "google"
          ? "https://oauth2.googleapis.com/token"
          : canvasBase() + "/login/oauth2/token",
        { method: "POST", body },
      )
    ).json();
    await database()
      .collection("connections")
      .updateOne(
        { _id: row._id },
        {
          $set: {
            encrypted: seal({
              ...t,
              ...fresh,
              expiresAt: Date.now() + (fresh.expires_in || 3600) * 1000,
            }),
            status: "connected",
          },
        },
      );
    return fresh.access_token as string;
  } catch {
    await database()
      .collection("connections")
      .updateOne({ _id: row._id }, { $set: { status: "expired" } });
    throw new HttpError(409, "Connection expired. Reconnect from Settings.");
  }
}
async function canvasPages(url: string, headers: Record<string, string>) {
  const rows: any[] = [];
  for (let page = 0; page < 10; page++) {
    const u = new URL(url);
    if (u.origin !== canvasBase() || !u.pathname.startsWith("/api/v1/"))
      throw new HttpError(502, "Canvas returned an invalid pagination link.");
    const response = await remote(u.href, { headers }),
      data = await response.json();
    if (!Array.isArray(data))
      throw new HttpError(502, "Unexpected Canvas response.");
    rows.push(...data);
    const next = response.headers
      .get("link")
      ?.split(",")
      .find((x) => /rel="next"/.test(x))
      ?.match(/<([^>]+)>/)?.[1];
    if (!next) return rows;
    url = next;
  }
  throw new HttpError(
    502,
    "Canvas returned too many pages. Availability was not updated to avoid incomplete conflict checks.",
  );
}
export async function syncCalendar(userId: string, p: Provider) {
  const token = await tokenFor(userId, p),
    headers = { Authorization: `Bearer ${token}` },
    start = new Date().toISOString(),
    end = DateTime.now().plus({ days: 60 }).toISO();
  let busy: Profile["busy"] = [],
    extra: any = {};
  if (p === "google") {
    const data = await (
      await remote("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: start,
          timeMax: end,
          items: [{ id: "primary" }],
        }),
      })
    ).json();
    if (data.calendars?.primary?.errors)
      throw new HttpError(
        409,
        "Google Calendar availability could not be read. Check permissions.",
      );
    busy = (data.calendars?.primary?.busy || []).map((b: any) => ({
      id: hash(b.start + b.end),
      start: b.start,
      end: b.end,
      source: "google",
    }));
  } else {
    const base = canvasBase();
    const user = await (
      await remote(base + "/api/v1/users/self/profile", { headers })
    ).json();
    const courses = await canvasPages(
      base + "/api/v1/courses?enrollment_state=active&per_page=100",
      headers,
    );
    const contexts = [
      "user_" + user.id,
      ...courses.map((c: any) => "course_" + c.id),
    ];
    const params = new URLSearchParams({
      start_date: start,
      end_date: end!,
      per_page: "100",
    });
    contexts.forEach((c) => params.append("context_codes[]", c));
    const events = await canvasPages(
      base + "/api/v1/calendar_events?" + params,
      headers,
    );
    busy = events
      .filter((e: any) => e.start_at && e.end_at && e.start_at < e.end_at)
      .map((e: any) => ({
        id: String(e.id),
        start: e.start_at,
        end: e.end_at,
        source: "canvas",
      }));
    const announcementParams = new URLSearchParams({ per_page: "100" });
    contexts
      .filter((c) => c.startsWith("course_"))
      .forEach((c) => announcementParams.append("context_codes[]", c));
    const announcements =
      contexts.length > 1
        ? await canvasPages(
            base + "/api/v1/announcements?" + announcementParams,
            headers,
          )
        : [];
    extra = {
      canvasUserId: user.id,
      courses: courses.map((c: any) => ({ id: c.id, name: c.name })),
      announcements: announcements.map((a: any) => ({
        id: a.id,
        title: a.title,
        url: a.html_url,
      })),
      bounded: true,
    };
  }
  await database()
    .collection("private_context")
    .updateOne(
      { userId, provider: p },
      {
        $set: {
          encrypted: seal({ busy, ...extra }),
          syncedAt: new Date(),
          coverageStart: start,
          coverageEnd: end,
        },
      },
      { upsert: true },
    );
  await database()
    .collection("connections")
    .updateOne(
      { userId, provider: p },
      { $set: { lastSync: new Date(), status: "connected" } },
    );
  return {
    busyCount: busy.length,
    ...(p === "canvas"
      ? {
          courseCount: extra.courses.length,
          announcementCount: extra.announcements.length,
        }
      : {}),
    coverageEnd: end,
  };
}
export async function withPrivateContext(userId: string, profile: Profile) {
  const rows = await database()
    .collection("private_context")
    .find({
      userId,
      provider: { $in: ["google", "canvas"] },
      syncedAt: { $gte: new Date(Date.now() - 24 * 3600000) },
    })
    .toArray();
  return {
    ...profile,
    busy: [
      ...profile.busy,
      ...rows.flatMap((r) => unseal(r.encrypted).busy || []),
    ],
  };
}
export function writeKey(userId: string, eventId: string, p: Provider) {
  return hash(`${userId}|${eventId}|${p}`);
}
export async function addCalendar(userId: string, p: Provider, e: CampusEvent) {
  if (!e.end || e.endEstimated || e.timeTBD || e.status === "cancelled")
    throw new HttpError(
      400,
      "This event needs confirmed start and end times before adding it.",
    );
  const writes = database().collection("calendar_writes"),
    filter = { userId, eventId: e.id, destination: p },
    key = writeKey(userId, e.id, p);
  const existing = await writes.findOne(filter);
  if (existing?.status === "complete")
    return { duplicate: true, id: existing.remoteId };
  if (existing?.status === "pending")
    throw new HttpError(
      409,
      "This write is still being checked. Please do not repeat it.",
    );
  const token = await tokenFor(userId, p),
    headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  if (p === "canvas" && process.env.CANVAS_WRITES_ENABLED !== "true")
    throw new HttpError(
      403,
      "Canvas writes require a developer key with calendar-write permission.",
    );
  try {
    await writes.insertOne({
      ...filter,
      key,
      status: "pending",
      createdAt: new Date(),
    });
  } catch {
    throw new HttpError(409, "This event is already being added.");
  }
  try {
    let id: string;
    if (p === "google") {
      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            id: key,
            summary: e.title,
            description:
              e.description +
              (e.onlineUrl ? "\nJoin online: " + e.onlineUrl : "") +
              "\n" +
              e.sources[0].url,
            location: e.location || "",
            start: { dateTime: e.start, timeZone: e.timezone },
            end: { dateTime: e.end, timeZone: e.timezone },
          }),
        },
      );
      if (!res.ok && res.status !== 409) throw new Error("Write unsuccessful");
      id = key;
    } else {
      const user = await (
        await remote(canvasBase() + "/api/v1/users/self/profile", { headers })
      ).json();
      const out = await (
        await remote(canvasBase() + "/api/v1/calendar_events", {
          method: "POST",
          headers,
          body: JSON.stringify({
            calendar_event: {
              context_code: "user_" + user.id,
              title: e.title,
              start_at: e.start,
              end_at: e.end,
              location_name: e.location || "",
              description:
                e.description +
                (e.onlineUrl ? "\nJoin online: " + e.onlineUrl : "") +
                "\n" +
                e.sources[0].url,
            },
          }),
        })
      ).json();
      id = String(out.id);
    }
    await writes.updateOne(filter, {
      $set: { status: "complete", remoteId: id },
    });
    await track(userId, "calendar_addition", e.id);
    return { id, duplicate: false };
  } catch {
    if (p === "google") await writes.deleteOne(filter); // Provider-generated deterministic ID makes retries safe.
    // Canvas has no documented idempotency key: retain pending lock on ambiguous failures.
    throw new HttpError(
      502,
      p === "canvas"
        ? "Canvas did not confirm the result. Check Canvas before retrying; this write is locked to prevent duplicates."
        : "Google did not confirm the result. Retrying is safe.",
    );
  }
}
export async function disconnect(userId: string, p: Provider) {
  const row = await database()
    .collection("connections")
    .findOne({ userId, provider: p });
  let revoked = false;
  if (row) {
    const t = unseal(row.encrypted);
    try {
      if (p === "google")
        await remote("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          body: new URLSearchParams({
            token: t.refresh_token || t.access_token,
          }),
        });
      else
        await remote(canvasBase() + "/login/oauth2/token", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${t.access_token}` },
        });
      revoked = true;
    } catch {}
  }
  await database().collection("connections").deleteOne({ userId, provider: p });
  await database()
    .collection("private_context")
    .deleteOne({ userId, provider: p });
  return { disconnected: true, revoked };
}
