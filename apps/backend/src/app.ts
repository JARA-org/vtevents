import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { z, ZodError } from "zod";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  emptyProfile,
  profileSchema,
  recommendations,
  categories,
  CAMPUS_TZ,
} from "./domain.js";
import type {
  BootstrapView,
  CampusEvent,
  DiscoveryView,
  UserMemoryView,
} from "../../../packages/shared/src/contracts.js";
import {
  discoverySchema,
  discoverEvents,
  timelineSchema,
  discoverTimeline,
} from "./discovery.js";
import { config, HttpError } from "./config.js";
import { db, database, mongoClient } from "./store.js";
import { sourceStatus, liveEvents, liveDeadlines, refreshSources, unreadableRecords } from "./coordinator.js";
import { consolidateEvents } from "./event-consolidation.js";
import { ansRuntime, isAnsAssistantRequest } from "./ans-runtime.js";
import { searchPublicMemory, publicEventById, publicEventIds } from "./public-memory.js";
import { askGobbler, assistantRequestSchema } from "./assistant.js";
import { assistantState } from "./assistant-state.js";
import { analyticsKinds, track, eraseAnalytics } from "./analytics.js";
import { registerDiscordBotRoutes } from "./discord-bot-http.js";
import { discordPublication } from "./discord-publication.js";
import { clubAccounts } from "./club-accounts.js";
import { userMemory, inferInterests } from "./user-memory.js";
import { accountEmailReady, queueAccountEmail } from "./account-email.js";
import { runJobs } from "./jobs.js";
import { pseudonym } from "./security.js";
export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://gobblerconnect.vt.edu", "https://static-prod-us-east-1.campusgroups.com", "https://hokiesports.com", "https://storage.googleapis.com"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'", "blob:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      skip: isAnsAssistantRequest,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const auth =
    db && process.env.BETTER_AUTH_SECRET
      ? betterAuth({
          appName: "My Gobbler",
          baseURL: config.origin,
          secret: process.env.BETTER_AUTH_SECRET,
          database: mongodbAdapter(db, { client: mongoClient }),
          emailAndPassword: {
            enabled: true,
            minPasswordLength: 12,
            resetPasswordTokenExpiresIn: 3600,
            revokeSessionsOnPasswordReset: true,
            ...(accountEmailReady()
              ? {
                  sendResetPassword: async ({
                    user,
                    url,
                  }: {
                    user: { id: string; email: string };
                    url: string;
                  }) => {
                    await queueAccountEmail(user.email, url, "reset", user.id);
                  },
                }
              : {}),
          },
          ...(accountEmailReady()
            ? {
                emailVerification: {
                  sendOnSignUp: true,
                  expiresIn: 3600,
                  sendVerificationEmail: async ({
                    user,
                    url,
                  }: {
                    user: { id: string; email: string };
                    url: string;
                  }) => {
                    await queueAccountEmail(user.email, url, "verify", user.id);
                  },
                },
              }
            : {}),
          session: { expiresIn: 604800, updateAge: 86400 },
          advanced: { useSecureCookies: config.production },
          trustedOrigins: [config.origin],
          rateLimit: { enabled: true },
          user: { deleteUser: { enabled: false } },
        })
      : null;
  app.get("/api/account-email", (_req, res) =>
    res
      .set("Cache-Control", "no-store")
      .json({ available: accountEmailReady() }),
  );
  if (auth) app.all("/api/auth/*splat", toNodeHandler(auth));
  else
    app.all("/api/auth/*splat", (_q, r) =>
      r.status(503).json({
        message:
          "Account services are awaiting MongoDB configuration. Please try again later.",
      }),
    );
  registerDiscordBotRoutes(app);
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.path !== "/jobs" &&
      req.headers.origin !== config.origin
    )
      return res
        .status(403)
        .json({ message: "This request must come from My Gobbler." });
    next();
  });
  const protect = async (req: Request, res: Response, next: NextFunction) => {
    if (!auth) throw new HttpError(503, "Account services are not configured.");
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) throw new HttpError(401, "Sign in to continue.");
    res.locals.user = session.user;
    res.locals.session = session.session;
    next();
  };
  const profile = async (id: string, name = "Hokie") => {
    const p = await database().collection("profiles").findOne({ userId: id });
    if (!p) return { ...emptyProfile, name };
    const parsed = profileSchema.safeParse(p);
    // A stored record that no longer validates is a server fault, not a bad form
    // submission: report it as unavailable and log the failing fields only.
    if (!parsed.success) {
      console.error("stored_profile_invalid", JSON.stringify({
        fields: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 10),
      }));
      throw new HttpError(
        503,
        "Your saved preferences could not be loaded. Please try again shortly.",
      );
    }
    return parsed.data;
  };
  app.get("/api/clubs/mine", protect, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await clubAccounts.list(res.locals.user.id));
  });
  app.post("/api/clubs", protect, async (req, res) =>
    res.json(await clubAccounts.create(res.locals.user.id, req.body)),
  );
  app.post("/api/clubs/discord", protect, async (req, res) =>
    res.json(await clubAccounts.link(res.locals.user.id, req.body)),
  );
  app.get("/api/clubs/:clubId/workspace", protect, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const workspace = await clubAccounts.workspace(
      res.locals.user.id,
      String(req.params.clubId),
    );
    const published = (
      await discordPublication.list({ includePast: true })
    ).filter((row) => row.event.clubId === workspace.club.id);
    res.json({
      ...workspace,
      events: [...workspace.events, ...published.map((row) => row.event)],
      candidates: [],
      editableEvents: published.map((row) => row.edit),
    });
  });
  app.patch("/api/clubs/events/:eventId", protect, async (req, res) => {
    res.json(
      await discordPublication.edit(res.locals.user.id, {
        ...req.body,
        eventId: String(req.params.eventId),
      }),
    );
  });
  const currentEvents = async (includePast = false) => {
    const published = (await discordPublication.list({ includePast })).map((row) => row.event);
    const publicEvents = liveEvents();
    // Website records were already reconciled by the coordinator. Discord
    // eligibility is rechecked on every read so withdrawals never use a cache.
    return published.length
      ? ansRuntime ? await ansRuntime.reconcile([...publicEvents, ...published]) : consolidateEvents([...publicEvents, ...published])
      : publicEvents;
  };
  const currentEvent = async (id: string) => {
    const e = (await currentEvents()).find((e) => e.id === id || e.aliases?.includes(id));
    if (!e)
      throw new HttpError(
        404,
        "This event is no longer in the current listings.",
      );
    return e;
  };
  app.get("/api/bootstrap", (_req, res) => {
    const view: BootstrapView = {
      contractVersion: 6,
      categories: [...categories],
      timezone: CAMPUS_TZ,
      emptyProfile,
    };
    res.json(view);
  });
  app.post("/api/profile/validate", protect, (req, res) =>
    res.json(profileSchema.parse(req.body)),
  );
  // Authenticated stale clients receive a terminal response, with no domain effects.
  app.all("/api/availability/preview", protect, (_req, res) =>
    res.status(410).json({ message: "This feature has been retired. Please refresh the app." }),
  );
  app.post("/api/discovery", protect, async (req, res) => {
    const input = discoverySchema.parse(req.body);
    const id = res.locals.user.id;
    const [p, saved, feedback] = await Promise.all([
      profile(id),
      database().collection("saved").find({ userId: id }).toArray(),
      database().collection("feedback").find({ userId: id }).toArray(),
    ]);
    res.json(
      discoverEvents(
        input,
        await currentEvents(),
        p,
        saved.map((r) => r.eventId),
        Object.fromEntries(feedback.map((r) => [r.eventId, r.value])),
      ),
    );
  });
  app.post("/api/timeline", protect, async (req, res) => {
    const input = timelineSchema.parse(req.body);
    if (input.startDate === undefined && input.endDate === undefined) {
      res.json(discoverTimeline(input, [], emptyProfile, [], {}));
      return;
    }
    const id = res.locals.user.id;
    const [p, saved, feedback] = await Promise.all([
      profile(id),
      database().collection("saved").find({ userId: id }).toArray(),
      database().collection("feedback").find({ userId: id }).toArray(),
    ]);
    res.json(discoverTimeline(input, await currentEvents(), p,
      saved.map(r => r.eventId), Object.fromEntries(feedback.map(r => [r.eventId, r.value]))));
  });
  // Anonymous read-only readiness probe. No provider calls, writes or retries;
  // bounded Mongo ping fails closed with redacted 503 when storage is unavailable.
  app.get("/api/health", async (_req, res) => {
    let databaseReady = false;
    try {
      databaseReady =
        !!db && (await db.command({ ping: 1 }, { timeoutMS: 2000 })).ok === 1;
    } catch {
      /* Never expose connection details in a public health response. */
    }
    const ready = databaseReady && !!auth;
    res
      .set("Cache-Control", "no-store")
      .status(ready ? 200 : 503)
      .json({
        ok: ready,
        name: "My Gobbler",
        database: databaseReady,
        accounts: !!auth,
        gemini: !!process.env.GEMINI_API_KEY,
        sources: sourceStatus,
        unreadableRecords,
      });
  });
  app.get("/api/events", protect, async (req, res) => {
    if (req.query.mode && req.query.mode !== "live")
      throw new HttpError(400, "Unsupported event mode.");
    res.json({
      mode: "live",
      events: await currentEvents(),
      sources: sourceStatus,
    });
  });
  app.get("/api/deadlines", protect, (_req, res) => res.json({deadlines:liveDeadlines()}));
  app.get("/api/public-memory", protect, async (req,res) => res.json(await searchPublicMemory(z.string().max(200).parse(req.query.q||""))));
  // A personal record stays available while its event is still reachable. Current
  // listings only carry upcoming events, so an event that has already happened is
  // resolved through public memory; a withdrawn record is absent from both.
  const withAvailability = async (memory: UserMemoryView, listings: CampusEvent[]) => {
    const missing = memory.attendance
      .filter((record) => !listings.some((event) => event.id === record.eventId))
      .map((record) => record.eventId);
    const remembered = missing.length ? await publicEventIds(missing) : new Set<string>();
    const attendance = memory.attendance.map((record) => ({
        ...record,
        available:
          listings.some((event) => event.id === record.eventId) ||
          remembered.has(record.eventId),
      }));
    return { ...memory, attendance, inferredInterests: inferInterests(attendance) };
  };
  app.get("/api/memory", protect, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const listings = await currentEvents(true);
    const memory = await userMemory.view(res.locals.user.id, listings);
    res.json(await withAvailability(memory, listings));
  });
  app.put("/api/memory/attendance/:eventId", protect, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { attended } = z.object({ attended: z.boolean() }).strict().parse(req.body);
    const eventId = String(req.params.eventId);
    const listings = await currentEvents(true);
    // Attendance is about events that already happened, which have left the current
    // listings. Offer the remembered public record for exactly the requested id.
    const remembered =
      attended && !listings.some((e) => e.id === eventId || e.aliases?.includes(eventId))
        ? await publicEventById(eventId)
        : null;
    const memory = await userMemory.confirm(
      res.locals.user.id,
      eventId,
      attended,
      remembered ? [...listings, remembered] : listings,
    );
    res.json(await withAvailability(memory, listings));
  });
  app.delete("/api/memory", protect, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { scope } = z
      .object({ scope: z.enum(["attendance", "all"]) })
      .strict()
      .parse(req.body ?? {});
    res.json(await userMemory.forget(res.locals.user.id, scope));
  });
  // Historical clients receive an explicit retirement response. Authenticated,
  // no event lookup, provider access, download, analytics or other effects; safe to retry.
  app.get("/api/events/:id/ics", protect, (_req, res) => {
    res.status(410).json({ message: "Calendar downloads have been retired.", code: "FEATURE_RETIRED" });
  });
  app.get("/api/me", protect, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = res.locals.user.id;
    const [p, saved, feedback] = await Promise.all([
      profile(id, res.locals.user.name),
      database().collection("saved").find({ userId: id }).toArray(),
      database().collection("feedback").find({ userId: id }).toArray(),
    ]);
    res.json({
      user: { id, name: res.locals.user.name, email: res.locals.user.email },
      profile: p,
      saved: saved.map((s) => s.eventId),
      feedback: Object.fromEntries(feedback.map((f) => [f.eventId, f.value])),
    });
  });
  // Empty legacy storage columns support rollback; they are never read or returned by v4.
  app.put("/api/profile", protect, async (req, res) => {
    const p = profileSchema.parse(req.body);
    await database()
      .collection("profiles")
      .updateOne({ userId: res.locals.user.id }, { $set: { ...p, recurring: [], busy: [] } }, { upsert: true });
    res.json(p);
  });
  app.get("/api/recommendations", protect, async (_req, res) => {
    const id = res.locals.user.id,
      p = await profile(id),
      saved = await database()
        .collection("saved")
        .find({ userId: id })
        .toArray(),
      feedback = await database()
        .collection("feedback")
        .find({ userId: id })
        .toArray();
    res.json({
      recommendations: recommendations(
        await currentEvents(),
        p,
        saved.map((x) => x.eventId),
        Object.fromEntries(feedback.map((f) => [f.eventId, f.value])),
      ),
    });
  });
  app.put("/api/saved/:id", protect, async (req, res) => {
    await currentEvent(String(req.params.id));
    const { saved } = z.object({ saved: z.boolean() }).parse(req.body),
      filter = { userId: res.locals.user.id, eventId: req.params.id };
    if (saved) {
      await database()
        .collection("saved")
        .updateOne(filter, { $set: { savedAt: new Date() } }, { upsert: true });
      await track(res.locals.user.id, "save", String(req.params.id));
    } else await database().collection("saved").deleteOne(filter);
    res.json({ saved });
  });
  app.post("/api/feedback", protect, async (req, res) => {
    const body = z
      .object({
        eventId: z.string(),
        value: z.union([z.literal(-1), z.literal(1)]),
      })
      .parse(req.body);
    await currentEvent(body.eventId);
    await database()
      .collection("feedback")
      .updateOne(
        { userId: res.locals.user.id, eventId: body.eventId },
        { $set: { value: body.value } },
        { upsert: true },
      );
    await track(res.locals.user.id, "recommendation_feedback", body.eventId);
    res.json({ ok: true });
  });
  app.get("/api/assistant/memories", protect, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ memories: await assistantState.list(res.locals.user.id) });
  });
  app.post("/api/assistant/memories", protect, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ memories: await assistantState.confirm(res.locals.user.id, req.body) });
  });
  app.patch("/api/assistant/memories/:id", protect, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ memories: await assistantState.edit(res.locals.user.id, { ...req.body, id: String(req.params.id) }) });
  });
  app.delete("/api/assistant/memories/:id", protect, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ memories: await assistantState.remove(res.locals.user.id, String(req.params.id)) });
  });
  app.post(
    ["/api/assistant", "/api/assistant/chat"],
    protect,
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const { query, ...context } = assistantRequestSchema.parse(req.body);
      if (ansRuntime && !isAnsAssistantRequest(req)) {
        res.json(await ansRuntime.chat({ query, ...context }, req.headers.cookie || ""));
        return;
      }
      const id = res.locals.user.id,
        p = await profile(id);
      const [saved, feedback] = await Promise.all([
        database().collection("saved").find({ userId: id }).toArray(),
        database().collection("feedback").find({ userId: id }).toArray(),
      ]);
      const listings = await currentEvents();
      res.json(
        await askGobbler(
          query,
          listings,
          p,
          saved.map((r) => r.eventId),
          Object.fromEntries(feedback.map((r) => [r.eventId, r.value])),
          { ...context, userId: id },
        ),
      );
    },
  );
  app.post("/api/analytics", protect, async (req, res) => {
    const { kind, eventId } = z
      .object({ kind: z.enum(analyticsKinds), eventId: z.string() })
      .parse(req.body);
    await currentEvent(eventId);
    await track(res.locals.user.id, kind, eventId);
    res.json({ ok: true });
  });
  // Retired narration accepts stale-client requests only to return a terminal error.
  // Session required; no domain reads/writes, provider calls, retries or transaction.
  app.post("/api/narration", protect, (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.status(410).json({ message: "Event narration has been retired. Please refresh the app.", code: "FEATURE_RETIRED" });
  });
  // Retirement guard for stale clients. After session authentication, handlers
  // have no provider, database, model or write effects; retries are terminal.
  app.all([
    "/api/connections", "/api/connections/:provider",
    "/api/connections/:provider/connect", "/api/connections/:provider/callback",
    "/api/connections/:provider/sync", "/api/private-context", "/api/calendar",
  ], protect, (_req, res) => res.status(410).json({
    message: "Campus connections have been retired. Please refresh the app.",
  }));
  // Retired OAuth/channel-management routes never reinterpret old private consent as public consent.
  app.all(
    [
      "/api/discord/owned-servers",
      "/api/discord/servers/:guildId",
      "/api/discord/channels",
    ],
    protect,
    (_q, r) =>
      r.status(410).json({
        message:
          "Discord is now a server bot. Configure channels inside Discord.",
      }),
  );
  app.delete("/api/account", protect, async (req, res) => {
    z.object({ confirmation: z.literal("DELETE") }).parse(req.body);
    if (Date.now() - new Date(res.locals.session.createdAt).getTime() > 300000)
      throw new HttpError(
        403,
        "For your security, sign out and sign in again before deleting your account.",
      );
    const id = res.locals.user.id;
    const { ObjectId } = await import("mongodb");
    const identifiers = ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id];
    await eraseAnalytics(id);
    for (const name of [
      "assistant_memories",
      "assistant_memory_owners",
      "account_email_outbox",
      "profiles",
      "discord_guilds",
      "saved",
      "connections",
      "private_context",
      "calendar_writes",
      "feedback",
      "oauth_states",
      "session",
      "account",
      // Personal memory is deleted with the account it belongs to.
      "user_attendance",
    ])
      await database()
        .collection(name)
        .deleteMany({ userId: { $in: identifiers } });
    await database().collection("user_memory_locks").deleteMany({ _id: { $in: identifiers } as never });
    await database()
      .collection("outbox")
      .deleteMany({ pseudonym: pseudonym(id) });
    await database().collection("user").deleteOne({ id }); // Better Auth Mongo user uses ObjectId; delete explicitly below.
    if (ObjectId.isValid(id))
      await database()
        .collection("user")
        .deleteOne({ _id: new ObjectId(id) });
    res.json({ deleted: true });
  });
  app.post("/api/jobs", async (req, res) => {
    if (
      !process.env.JOB_SECRET ||
      req.headers.authorization !== `Bearer ${process.env.JOB_SECRET}`
    )
      throw new HttpError(401, "Unauthorized job.");
    await runJobs();
    res.json({ ok: true });
  });
  const publicDir = resolve(process.cwd(), "apps/frontend/dist");
  if (existsSync(publicDir)) {
    app.use(
      express.static(publicDir, {
        maxAge: "1h",
        // Public asset response hook: only HTML cache headers change. No auth,
        // persistence, retry or transaction. Revalidate the entry document so a
        // deployment cannot leave browsers running a retired frontend for an hour.
        setHeaders(res, filePath) {
          if (filePath.endsWith(".html"))
            res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.get("/{*path}", (req, res, next) =>
      req.path.startsWith("/api/")
        ? next()
        : res.sendFile(resolve(publicDir, "index.html")),
    );
  }
  app.use(
    (error: unknown, req: Request, res: Response, _next: NextFunction) => {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 500;
      if (status === 500)
        console.error("request_failed", {
          kind: error instanceof Error ? error.name : "unknown",
        });
      // A 400 from request validation used to be indistinguishable from a stored
      // record failing its schema. Record the failing paths so an internal data
      // fault can never again hide behind "check your entries".
      else if (error instanceof ZodError)
        console.warn(
          "request_rejected",
          JSON.stringify({
            path: req.path,
            fields: error.issues.map((issue) => issue.path.join(".")).slice(0, 10),
          }),
        );
      res.status(status).json({
        message:
          error instanceof HttpError
            ? error.message
            : status === 400
              ? "Some fields are invalid. Check your entries."
              : "Something went wrong. Please try again.",
      });
    },
  );
  return app;
}
