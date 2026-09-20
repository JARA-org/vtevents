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
  eventICS,
  recommendations,
  categories,
  CAMPUS_TZ,
} from "./domain.js";
import type {
  BootstrapView,
  DiscoveryView,
} from "../../../packages/shared/src/contracts.js";
import {
  discoverySchema,
  discoverEvents,
  availabilitySchema,
  previewAvailability,
} from "./discovery.js";
import { config, HttpError } from "./config.js";
import { db, database, mongoClient } from "./store.js";
import { sourceStatus, liveEvents, liveDeadlines, refreshSources } from "./coordinator.js";
import { consolidateEvents } from "./event-consolidation.js";
import { searchPublicMemory } from "./public-memory.js";
import { askGobbler } from "./assistant.js";
import { narrate, voiceReady } from "./narration.js";
import { analyticsKinds, track, eraseAnalytics } from "./analytics.js";
import {
  Provider,
  startOAuth,
  finishOAuth,
  syncCalendar,
  providerReady,
  addCalendar,
  disconnect,
  withPrivateContext,
} from "./integrations.js";
import { registerDiscordBotRoutes } from "./discord-bot-http.js";
import { discordPublication } from "./discord-publication.js";
import { clubAccounts } from "./club-accounts.js";
import { runJobs } from "./jobs.js";
import { unseal, pseudonym } from "./security.js";
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
          imgSrc: ["'self'", "data:"],
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
          emailAndPassword: { enabled: true, minPasswordLength: 12 },
          session: { expiresIn: 604800, updateAge: 86400 },
          advanced: { useSecureCookies: config.production },
          trustedOrigins: [config.origin],
          rateLimit: { enabled: true },
          user: { deleteUser: { enabled: false } },
        })
      : null;
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
    return p ? profileSchema.parse(p) : { ...emptyProfile, name };
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
  const currentEvents = async () => consolidateEvents([
    ...liveEvents(),
    ...(await discordPublication.list()).map((row) => row.event),
  ]);
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
      contractVersion: 2,
      categories: [...categories],
      timezone: CAMPUS_TZ,
      emptyProfile,
    };
    res.json(view);
  });
  app.post("/api/profile/validate", protect, (req, res) =>
    res.json(profileSchema.parse(req.body)),
  );
  app.post("/api/availability/preview", protect, (req, res) =>
    res.json(previewAvailability(availabilitySchema.parse(req.body))),
  );
  app.post("/api/discovery", protect, async (req, res) => {
    const input = discoverySchema.parse(req.body);
    const id = res.locals.user.id;
    const [p, saved, feedback] = await Promise.all([
      withPrivateContext(id, await profile(id)),
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
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      name: "My Gobbler",
      database: !!db,
      accounts: !!auth,
      gemini: !!process.env.GEMINI_API_KEY,
      voice: voiceReady(),
      sources: sourceStatus,
    }),
  );
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
  app.get("/api/events/:id/ics", protect, async (req, res) => {
    if (req.query.mode && req.query.mode !== "live")
      throw new HttpError(400, "Unsupported event mode.");
    const e = await currentEvent(String(req.params.id));
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="my-gobbler-${e.id.replace(/[^a-zA-Z0-9-]/g, "")}.ics"`,
    );
    res.send(eventICS(e));
  });
  app.get("/api/me", protect, async (_req, res) => {
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
  app.put("/api/profile", protect, async (req, res) => {
    const p = profileSchema.parse(req.body);
    if (p.busy.some((b) => b.source !== "manual"))
      throw new HttpError(400, "Only manual busy blocks can be edited here.");
    await database()
      .collection("profiles")
      .updateOne({ userId: res.locals.user.id }, { $set: p }, { upsert: true });
    res.json(p);
  });
  app.get("/api/recommendations", protect, async (_req, res) => {
    const id = res.locals.user.id,
      p = await withPrivateContext(id, await profile(id)),
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
  app.post(
    "/api/assistant",
    protect,
    rateLimit({ windowMs: 60000, limit: 10 }),
    async (req, res) => {
      const { query } = z
        .object({ query: z.string().min(1).max(1000) })
        .parse(req.body);
      const id = res.locals.user.id,
        p = await withPrivateContext(id, await profile(id));
      const [saved, feedback] = await Promise.all([
        database().collection("saved").find({ userId: id }).toArray(),
        database().collection("feedback").find({ userId: id }).toArray(),
      ]);
      res.json(
        await askGobbler(
          query,
          await currentEvents(),
          p,
          saved.map((r) => r.eventId),
          Object.fromEntries(feedback.map((r) => [r.eventId, r.value])),
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
  app.post(
    "/api/narration",
    protect,
    rateLimit({ windowMs: 60000, limit: 5 }),
    async (req, res) => {
      const { eventIds } = z
        .object({ eventIds: z.array(z.string().max(120)).min(1).max(40) })
        .strict()
        .parse(req.body);
      const audio = await narrate(
        await Promise.all([...new Set(eventIds)].slice(0, 3).map(currentEvent)),
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.type("audio/mpeg").send(audio);
    },
  );
  app.get("/api/connections", protect, async (_req, res) => {
    const rows = await database()
      .collection("connections")
      .find(
        { userId: res.locals.user.id },
        { projection: { provider: 1, status: 1, lastSync: 1, channels: 1 } },
      )
      .toArray();
    res.json({
      connections: ["google", "canvas"].map((provider) => ({
        provider,
        configured: providerReady(provider as Provider),
        ...rows.find((r) => r.provider === provider),
        blocker:
          provider === "canvas"
            ? "University-enabled OAuth developer key required."
            : "Google OAuth client and consent configuration required.",
      })),
      sources: sourceStatus,
      analytics: process.env.DATABRICKS_TOKEN ? "configured" : "unavailable",
    });
  });
  app.post("/api/connections/:provider/connect", protect, async (req, res) => {
    const p = z.enum(["google", "canvas"]).parse(req.params.provider);
    res.json({
      url: await startOAuth(res.locals.user.id, p),
    });
  });
  app.get("/api/connections/:provider/callback", protect, async (req, res) => {
    const p = z.enum(["google", "canvas"]).parse(req.params.provider);
    if (req.query.error)
      return res.redirect("/?page=settings&connection=cancelled");
    const state = z.string().parse(req.query.state),
      code = z.string().parse(req.query.code);
    await finishOAuth(res.locals.user.id, p, state, code);
    res.redirect("/?page=settings&connection=connected");
  });
  app.post("/api/connections/:provider/sync", protect, async (req, res) => {
    const p = z.enum(["google", "canvas"]).parse(req.params.provider);
    try {
      res.json(await syncCalendar(res.locals.user.id, p));
    } catch (error) {
      await database()
        .collection("connections")
        .updateOne(
          { userId: res.locals.user.id, provider: p },
          { $set: { status: "error", lastAttempt: new Date() } },
        );
      throw error;
    }
  });
  app.delete("/api/connections/:provider", protect, async (req, res) => {
    const p = z.enum(["google", "canvas"]).parse(req.params.provider);
    res.json(await disconnect(res.locals.user.id, p));
  });
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
  app.get("/api/private-context", protect, async (_q, r) => {
    const rows = await database()
      .collection("private_context")
      .find({
        userId: r.locals.user.id,
        provider: { $in: ["google", "canvas"] },
      })
      .toArray();
    const contexts = [];
    for (const row of rows) {
      const content = unseal(row.encrypted);
      contexts.push({
        provider: row.provider,
        syncedAt: row.syncedAt,
        ...content,
      });
    }
    r.json(contexts);
  });
  app.post("/api/calendar", protect, async (req, res) => {
    const body = z
      .object({
        eventId: z.string(),
        destination: z.enum(["google", "canvas"]),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    res.json(
      await addCalendar(
        res.locals.user.id,
        body.destination,
        await currentEvent(body.eventId),
      ),
    );
  });
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
    for (const p of ["google", "canvas"] as const) await disconnect(id, p);
    for (const name of [
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
    ])
      await database()
        .collection(name)
        .deleteMany({ userId: { $in: identifiers } });
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
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
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
