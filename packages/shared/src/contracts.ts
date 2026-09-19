/**
 * My Little Gobbler boundary contracts, version 2 (authenticated app).
 * This file contains wire data and interfaces ONLY: no validation, fetching,
 * matching, storage, SDK imports, secrets, fixtures, or business implementation.
 * Dates on the wire are ISO strings, never Date/Luxon/Mongo objects.
 * Existing required fields and their meaning are frozen within each version. Add OPTIONAL
 * fields, preserve nullability, and ignore unknown fields. Breaking changes
 * require a parallel major-version contract and an explicit migration, never a rename.
 * `extensions` is namespaced JSON for experimental metadata, not core fields.
 * Interfaces under PlannedBackendServices and BackendModules are specifications;
 * declaring them does NOT expose a route or grant permissions.
 */
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Extensible {
  extensions?: Record<string, Json>;
}
export type Id = string;
export type Instant = string;
export type LocalDate = string;
export type LocalTime = string;
export type Mode = "live";
export type Category =
  | "Arts & music"
  | "Sports"
  | "Outdoors"
  | "Tech & science"
  | "Community"
  | "Career"
  | "Food & fun";
export type Provider = "google" | "canvas" | "discord";
export type CalendarProvider = "google" | "canvas";
export type SourceName =
  "gobblerconnect" | "vt-sports" | "vt-events" | "canvas" | "discord";
export interface SourceReference extends Extensible {
  source: SourceName;
  sourceId: Id;
  url: string;
  fetchedAt: Instant;
  sourceUpdatedAt?: Instant | null;
  evidenceId?: Id;
}
/** Existing event fields remain present even when richer optional fields arrive. */
export interface CampusEvent extends Extensible {
  id: Id;
  title: string;
  description: string;
  start: Instant;
  end: Instant | null;
  timezone: string;
  location: string | null;
  /** Optional attendance URL, independent of the physical location. Missing/null means not supplied. */
  onlineUrl?: string | null;
  /** True when online attendance is supported, including when the link is not yet supplied. Absent means unknown. */
  isOnline?: boolean;
  organizer: string | null;
  categories: Category[];
  sources: SourceReference[];
  updatedAt: Instant;
  status: "scheduled" | "cancelled";
  mode: Mode;
  timeTBD: boolean;
  allDay: boolean;
  endEstimated: boolean;
  stale?: boolean;
  revision?: string;
  clubId?: Id;
  sports?: SportsDetails;
  links?: EventLink[];
  evidence?: FieldEvidence[];
  conflicts?: FieldConflict[];
  visibility?: Visibility;
  timeDetails?: EventTimeDetails;
}
export interface EventTimeDetails extends Extensible {
  precision: "confirmed" | "date_only" | "start_only" | "end_only" | "unknown";
  startDate?: LocalDate;
  endDate?: LocalDate;
  note?: string;
  /** Legacy start remains required in v1; timeTBD prevents placeholder use. */
  confirmedStart?: Instant | null;
  confirmedEnd?: Instant | null;
}
export interface SportsDetails extends Extensible {
  sport: string;
  opponent: string | null;
  venueType: "home" | "away" | "neutral" | "unknown";
  state: "upcoming" | "live" | "final" | "postponed" | "cancelled" | "unknown";
  homeScore?: string | null;
  awayScore?: string | null;
  period?: string | null;
  clock?: string | null;
  opponentLogoUrl?: string;
  checkedAt?: Instant;
}
export interface EventLink extends Extensible {
  label: string;
  url: string;
  kind: "source" | "tickets" | "stream" | "stats" | "recap" | "other";
  embeddable?: boolean;
}
export interface RecurringBlock extends Extensible {
  id: Id;
  weekday: number;
  start: LocalTime;
  end: LocalTime;
  kind: "free" | "busy";
}
export interface BusyBlock extends Extensible {
  id: Id;
  start: Instant;
  end: Instant;
  source: "manual" | "google" | "canvas";
}
export interface Profile extends Extensible {
  name: string;
  interests: Category[];
  recurring: RecurringBlock[];
  busy: BusyBlock[];
  onboarded: boolean;
  aiEnabled: boolean;
}
export interface Fit extends Extensible {
  status: "free" | "conflict" | "unknown";
  reason: string;
}
export interface Recommendation extends Extensible {
  event: CampusEvent;
  fit: Fit;
  score: number;
  reason: string;
}
export interface UserSummary extends Extensible {
  id: Id;
  name: string;
  email: string;
}
export interface AccountView extends Extensible {
  user: UserSummary;
  profile: Profile;
  saved: Id[];
  feedback: Record<Id, number>;
}
export interface SourceHealth extends Extensible {
  status: string;
  lastSync?: Instant;
  count?: number;
  error?: string;
  completeness?: "complete" | "partial" | "unknown";
}
export interface HealthView extends Extensible {
  ok: boolean;
  name: string;
  database: boolean;
  accounts: boolean;
  gemini: boolean;
  sources: Record<string, SourceHealth>;
  voice?: boolean;
}
export interface BootstrapView extends Extensible {
  categories: Category[];
  timezone: string;
  emptyProfile: Profile;
  contractVersion: 2;
}
export interface EventList extends Extensible {
  mode: Mode;
  events: CampusEvent[];
  sources: Record<string, SourceHealth>;
  snapshot?: boolean;
  generatedAt?: Instant;
}
export interface DiscoveryRequest {
  mode?: Mode;
  search?: string;
  category?: Category | "All interests";
  dateFilter?: "Any day" | "Today" | "This week" | "Weekend";
}
export interface DiscoveryView extends Extensible {
  recommendations: Recommendation[];
  filtered: Recommendation[];
  savedRecommendations: Recommendation[];
  schedule: Recommendation[];
}
export interface AssistantReply extends Extensible {
  engine: string;
  notice: string;
  answer: string;
  recommendations: Recommendation[];
  conversationId?: Id;
  messageId?: Id;
  citations?: Citation[];
  suggestedActions?: SuggestedAction[];
}
export interface ConnectionView extends Extensible {
  provider: Provider;
  configured: boolean;
  blocker: string;
  status?: string;
  lastSync?: Instant | null;
  channels?: Id[];
}
export interface ConnectionsView extends Extensible {
  connections: ConnectionView[];
  sources: Record<string, SourceHealth>;
  analytics: string;
}
export interface DiscordChannel extends Extensible {
  id: Id;
  name: string;
  guildId: Id;
}
export interface Announcement extends Extensible {
  id: Id;
  url: string;
  title?: string;
  text?: string;
  channel?: string;
  timestamp?: Instant;
}
export interface PrivateContextView extends Extensible {
  provider: Provider;
  syncedAt: Instant;
  busy?: BusyBlock[];
  announcements?: Announcement[];
  courses?: { id: string | number; name: string }[];
  coverageStart?: Instant;
  coverageEnd?: Instant;
}
export interface SyncResult extends Extensible {
  busyCount?: number;
  courseCount?: number;
  announcementCount?: number;
  announcements?: number;
  coverageEnd?: Instant;
}
export interface CalendarWriteResult extends Extensible {
  id: Id;
  duplicate: boolean;
}
export interface ApiError extends Extensible {
  message: string;
  code?: string;
  requestId?: Id;
  retryable?: boolean;
  fields?: { path: string; message: string }[];
}
export type AnalyticsKind =
  | "recommendation_impression"
  | "event_view"
  | "save"
  | "calendar_addition"
  | "recommendation_feedback";
export interface AvailabilityInput {
  profile: Profile;
  block:
    | {
        kind: "recurring";
        weekday: number;
        start: LocalTime;
        end: LocalTime;
        availability: "free" | "busy";
      }
    | { kind: "dated"; date: LocalDate; start: LocalTime; end: LocalTime };
}
/** Actual HTTP contract. Body/query types are transport inputs, NOT authorization. */
export interface Operation<Input, Output> {
  input: Input;
  output: Output;
}
export interface HttpApi {
  /** PATCH /api/clubs/events/:eventId. Authenticated owner correction of published Discord event; revision checked, audited, no provider writes. */
  editClubEvent: Operation<ClubEventEdit, CampusEvent>;
  /** GET /api/clubs/mine. Session-scoped owned clubs, no side effects. */
  myClubs: Operation<void, { clubs: ManagedClub[]; canCreate?: boolean }>;
  /** POST /api/clubs. Create a new owned workspace, optionally consume Discord ticket atomically. Never claims imported clubs. */
  createClub: Operation<CreateManagedClubInput, ManagedClub>;
  /** GET /api/clubs/:clubId/workspace. Owner check; read events and staged candidates only. */
  clubWorkspace: Operation<{ clubId: Id }, ClubWorkspace>;
  /** POST /api/clubs/discord. Owner check; atomically consume Discord ticket, persist one-to-one server binding. */
  linkClubDiscord: Operation<
    { clubId: Id; discordTicket: string },
    ManagedClub
  >;
  /** POST /api/narration. Session required; reserves voice budget, reads public events, caches generated audio. No automatic retry. Binary audio/mpeg is decoded to this transport DTO. */
  narrate: Operation<{ eventIds: Id[] }, AudioData>;
  /** @deprecated Retired: returns HTTP 410; configure the server bot inside Discord. Historical shape retained. GET /api/discord/owned-servers. Session-scoped provider read; no writes. */
  listOwnedDiscordServers: Operation<void, { guilds: DiscordGuild[] }>;
  /** @deprecated Retired: returns HTTP 410; configure the server bot inside Discord. Historical shape retained. GET /api/discord/servers/:guildId. Verifies current ownership and returns allowed channels plus saved selection. */
  getDiscordServer: Operation<{ guildId: Id }, DiscordServerSettings>;
  /** @deprecated Retired: returns HTTP 410; configure the server bot inside Discord. Historical shape retained. PUT /api/discord/servers/:guildId. Verifies current ownership/visibility, stores channel policy and invalidates cached private announcements. */
  configureDiscordServer: Operation<
    { guildId: Id; channels: Id[] },
    { ok: boolean }
  >;
  /** GET /api/health. Public read; no domain writes. */
  health: Operation<void, HealthView>;
  /** GET /api/bootstrap. Read of server-owned form defaults; no writes. */
  bootstrap: Operation<void, BootstrapView>;
  /** GET /api/events?mode=. Authenticated listings; no writes. */
  listEvents: Operation<{ mode: Mode }, EventList>;
  /** GET /api/events/:id/ics?mode=. Returns calendar text; does NOT write any calendar. */
  exportCalendar: Operation<{ eventId: Id }, string>;
  /** GET /api/me. Session-scoped profile/saves/feedback; no writes. */
  getAccount: Operation<void, AccountView>;
  /** PUT /api/profile. Validates/replaces the caller's profile; returns persisted profile. */
  updateProfile: Operation<Profile, Profile>;
  /** POST /api/profile/validate. Validates a form draft; no persistence. */
  validateProfile: Operation<Profile, Profile>;
  /** POST /api/availability/preview. Validates/appends a block to a draft; no persistence. */
  previewAvailability: Operation<AvailabilityInput, Profile>;
  /** GET /api/recommendations. Session-scoped ranking with private busy context; no writes. */
  getRecommendations: Operation<void, { recommendations: Recommendation[] }>;
  /** POST /api/discovery. Session-scoped read-only search/ranking; submitted identity/preferences are not accepted. */
  discover: Operation<DiscoveryRequest, DiscoveryView>;
  /** PUT /api/saved/:id. Idempotent desired state; saving may enqueue analytics. */
  setSaved: Operation<{ eventId: Id; saved: boolean }, { saved: boolean }>;
  /** POST /api/feedback. Upserts caller feedback; enqueues analytics. */
  submitFeedback: Operation<{ eventId: Id; value: -1 | 1 }, { ok: boolean }>;
  /** POST /api/assistant. May consume model budget; does NOT change events/calendars. */
  askAssistant: Operation<{ query: string }, AssistantReply>;
  /** POST /api/analytics. Queues pseudonymous event; delivery is eventual. */
  track: Operation<{ kind: AnalyticsKind; eventId: Id }, { ok: boolean }>;
  /** GET /api/connections. Session-scoped readiness/status; excludes credentials. */
  listConnections: Operation<void, ConnectionsView>;
  /** POST /api/connections/:provider/connect. Persists expiring OAuth state; returns redirect URL. */
  connect: Operation<{ provider: Provider }, { url: string }>;
  /** GET /api/connections/:provider/callback. Consumes state, stores encrypted credentials, redirects. */
  finishConnection: Operation<
    { provider: Provider; state: string; code: string },
    { redirectUrl: string }
  >;
  /** POST /api/connections/:provider/sync. Reads provider, replaces private snapshot/status. */
  syncConnection: Operation<{ provider: Provider }, SyncResult>;
  /** DELETE /api/connections/:provider. Deletes local context/tokens; attempts remote revocation. */
  disconnect: Operation<
    { provider: Provider },
    { disconnected: boolean; revoked: boolean }
  >;
  /** @deprecated Retired: returns HTTP 410; configure the server bot inside Discord. Historical shape retained. GET /api/discord/channels. Provider reads; returns only authorized announcement channels. */
  listDiscordChannels: Operation<void, { channels: DiscordChannel[] }>;
  /** @deprecated Retired: returns HTTP 410; configure the server bot inside Discord. Historical shape retained. PUT /api/discord/channels. Validates access and persists selected channels. */
  selectDiscordChannels: Operation<{ channels: Id[] }, { ok: boolean }>;
  /** GET /api/private-context. Decrypts ONLY caller's context; no writes. */
  getPrivateContext: Operation<void, PrivateContextView[]>;
  /** POST /api/calendar. Requires confirmation; creates remote entry + idempotency record/analytics.
   * Ambiguous Canvas writes stay locked; do not blindly retry. */
  addCalendar: Operation<
    { eventId: Id; destination: CalendarProvider; confirmed: true },
    CalendarWriteResult
  >;
  /** DELETE /api/account. Recent session + DELETE required; local deletion/remote cleanup, irreversible. */
  deleteAccount: Operation<{ confirmation: "DELETE" }, { deleted: boolean }>;
  /** POST /api/jobs. Server credential only; refreshes snapshots/context and drains outbox. */
  runJobs: Operation<void, { ok: boolean }>;
  /** Better Auth endpoints: create session/account; cookies managed by server. */
  signUp: Operation<
    { email: string; password: string; name: string; callbackURL?: string },
    AuthResult
  >;
  signIn: Operation<
    { email: string; password: string; callbackURL?: string },
    AuthResult
  >;
  /** POST /api/auth/sign-out. Invalidates session/cookie. */
  signOut: Operation<Record<string, never>, { success: boolean }>;
}
export interface AuthResult extends Extensible {
  user: UserSummary;
  token?: string;
  redirect?: boolean;
  url?: string;
}
export type BackendClient = {
  [K in Exclude<keyof HttpApi, "runJobs" | "finishConnection">]: (
    input: HttpApi[K]["input"],
  ) => Promise<HttpApi[K]["output"]>;
};

// Future domain contracts. Optional capabilities MUST be advertised before use.
export interface PageRequest {
  cursor?: string;
  limit?: number;
}
export interface Page<T> extends Extensible {
  items: T[];
  nextCursor: string | null;
}
export interface Capabilities extends Extensible {
  contractVersion: 2;
  availableOperations: string[];
}
export type Visibility =
  | { kind: "public" }
  | { kind: "user"; userId: Id }
  | { kind: "channel"; guildId: Id; channelId: Id };
export interface Citation extends Extensible {
  sourceId: Id;
  url: string;
  excerpt?: string;
}
export interface FieldEvidence extends Extensible {
  id?: Id;
  field: string;
  value: Json;
  citation: Citation;
  observedAt: Instant;
  sourceUpdatedAt: Instant | null;
  method: "structured" | "extracted" | "manual";
}
export interface FieldConflict extends Extensible {
  field: string;
  alternatives: FieldEvidence[];
  resolution: "unresolved" | "authority" | "recency" | "reviewed";
  selectedEvidenceId?: Id;
  reason: string;
}
export interface SuggestedAction extends Extensible {
  kind: "view_event" | "save_event" | "prepare_calendar" | "open_source";
  label: string;
  eventId?: Id;
  url?: string;
}
export interface Club extends Extensible {
  id: Id;
  name: string;
  description: string;
  categories: Category[];
  links: EventLink[];
  sources: SourceReference[];
  updatedAt: Instant;
  typicalActivities?: string;
  summaryEvidence?: Citation[];
}
export interface NewsArticle extends Extensible {
  id: Id;
  title: string;
  url: string;
  publishedAt: Instant | null;
  summary: string | null;
  eventIds: Id[];
  clubIds: Id[];
  sources: SourceReference[];
}
export interface Conversation extends Extensible {
  id: Id;
  title: string;
  createdAt: Instant;
  updatedAt: Instant;
}
export interface ChatMessage extends Extensible {
  id: Id;
  conversationId: Id;
  role: "user" | "assistant";
  text: string;
  createdAt: Instant;
  citations?: Citation[];
  recommendations?: Recommendation[];
}
export interface Memory extends Extensible {
  id: Id;
  text: string;
  origin: "explicit" | "conversation";
  createdAt: Instant;
  updatedAt: Instant;
  expiresAt: Instant | null;
}
export interface CalendarDraft extends Extensible {
  id: Id;
  eventId: Id;
  destination: CalendarProvider;
  title: string;
  description: string;
  location: string | null;
  start: Instant | null;
  end: Instant | null;
  allDay: boolean;
  timezone: string;
  warnings: string[];
  canSubmit: boolean;
  revision: string;
}
export interface JobReceipt extends Extensible {
  id: Id;
  state: "queued" | "running" | "succeeded" | "failed";
  createdAt: Instant;
  completedAt?: Instant;
  error?: ApiError;
}
/** Planned functions, not implemented routes. Every operation uses session identity.
 * Errors: unauthenticated/forbidden/not_found/invalid/conflict/unavailable via ApiError.
 * Read methods never trigger refreshes or external writes implicitly. */
export interface PlannedBackendServices {
  /** Read supported operations, no writes. */
  getCapabilities(): Promise<Capabilities>;
  /** Read one authorized event and its evidence; no writes. */
  getEvent(input: { eventId: Id }): Promise<CampusEvent>;
  /** Read sports projection; no provider calls or writes on the request path. */
  getSportsTicker(
    input: PageRequest & { sport?: string },
  ): Promise<Page<CampusEvent>>;
  /** Read historical events; no writes. */
  getEventHistory(
    input: PageRequest & { clubId?: Id; sport?: string; opponent?: string },
  ): Promise<Page<CampusEvent>>;
  /** Read indexed clubs; no writes. */
  searchClubs(
    input: PageRequest & { query?: string; category?: Category },
  ): Promise<Page<Club>>;
  /** Read one club, no writes. */
  getClub(input: { clubId: Id }): Promise<Club>;
  /** Read sourced news associated with the requested entity; no writes. */
  getNews(
    input: PageRequest & { eventId?: Id; clubId?: Id },
  ): Promise<Page<NewsArticle>>;
  /** Persist caller's new conversation; returns its identity. */
  createConversation(input: { title?: string }): Promise<Conversation>;
  /** Read only caller's conversations, no writes. */
  listConversations(input: PageRequest): Promise<Page<Conversation>>;
  /** Read only caller's messages, no writes. */
  listMessages(
    input: PageRequest & { conversationId: Id },
  ): Promise<Page<ChatMessage>>;
  /** Persist message/reply, may consume AI budget. requestId deduplicates retries; no event/calendar writes. */
  sendMessage(input: {
    conversationId: Id;
    text: string;
    requestId: Id;
  }): Promise<AssistantReply>;
  /** Delete caller's conversation/messages; separately manage derived memories. */
  deleteConversation(input: {
    conversationId: Id;
  }): Promise<{ deleted: boolean; retainedMemoryIds: Id[] }>;
  /** Read caller-visible memories, no writes. */
  listMemories(input: PageRequest): Promise<Page<Memory>>;
  /** Persist explicit caller-approved memory; requestId deduplicates retries. */
  remember(input: {
    text: string;
    requestId: Id;
    expiresAt?: Instant;
  }): Promise<Memory>;
  /** Delete caller's memory and derived retrieval entries. */
  forget(input: { memoryId: Id }): Promise<{ deleted: boolean }>;
  /** Store editable draft with incomplete times; never writes to provider. */
  prepareCalendar(input: {
    eventId: Id;
    destination: CalendarProvider;
  }): Promise<CalendarDraft>;
  /** Update draft using optimistic revision; validates provider requirements, no external write. */
  editCalendarDraft(input: {
    draftId: Id;
    revision: string;
    changes: Partial<
      Pick<
        CalendarDraft,
        "title" | "description" | "location" | "start" | "end" | "allDay"
      >
    >;
  }): Promise<CalendarDraft>;
  /** Confirm validated draft; idempotent external write, receipt persisted; ambiguous writes remain pending. */
  commitCalendarDraft(input: {
    draftId: Id;
    revision: string;
    requestId: Id;
    confirmed: true;
  }): Promise<JobReceipt>;
  /** Read caller's operation status; no repeat external write. */
  getOperation(input: { operationId: Id }): Promise<JobReceipt>;
  /** Queue caller's export; persists job and scoped export artifact. */
  exportAccount(input: { requestId: Id }): Promise<JobReceipt>;
}

// Backend-to-backend ports. NEVER callable from a browser or exposed by generic RPC.
export interface RequestContext {
  requestId: Id;
  actor: { kind: "user"; userId: Id } | { kind: "worker"; jobId: Id };
  now: Instant;
}
export interface SourceRecord extends Extensible {
  source: string;
  sourceId: Id;
  payload: Json;
  fetchedAt: Instant;
  sourceUpdatedAt: Instant | null;
  visibility: Visibility;
  url: string;
}
export interface SourceBatch extends Extensible {
  source: string;
  records: SourceRecord[];
  coverage: { from: Instant | null; to: Instant | null };
  completeness: "complete" | "partial" | "unknown";
  nextCursor: string | null;
  rejected: { sourceId: Id | null; reason: string }[];
}
export interface ValidationReport<T> {
  accepted: T[];
  rejected: { sourceId: Id | null; reason: string }[];
  complete: boolean;
}
export interface MergeProposal {
  candidateIds: Id[];
  evidence: FieldEvidence[];
  conflicts: FieldConflict[];
  decision: "merge" | "separate" | "review";
  reason: string;
}
export interface ReconciliationPlan {
  expectedRevision: string;
  upserts: CampusEvent[];
  retireIds: Id[];
  aliases: { source: string; sourceId: Id; eventId: Id }[];
  unresolved: MergeProposal[];
}
export interface CommitReceipt {
  revision: string;
  inserted: number;
  updated: number;
  retired: number;
  committedAt: Instant;
}
export interface SourceAdapter {
  /** External read; returns raw evidence + completeness. Never writes canonical events. */
  fetch(
    input: { cursor?: string; from?: Instant; to?: Instant },
    context: RequestContext,
  ): Promise<SourceBatch>;
  /** Pure parsing/normalization; reports rejects, never silently declares partial data complete. */
  normalize(batch: SourceBatch): ValidationReport<CampusEvent>;
}
export interface EventRepository {
  /** Scoped read; storage objects never leave the implementation. */
  read(
    input: { ids?: Id[]; page?: PageRequest },
    context: RequestContext,
  ): Promise<Page<CampusEvent>>;
  /** Scoped snapshot read; no writes. */
  readSnapshot(
    input: { source: string },
    context: RequestContext,
  ): Promise<{ revision: string; batch: SourceBatch | null }>;
  /** Atomic compare-and-swap snapshot + canonical projection + aliases. Reject stale revision/partial destructive replacement. */
  commit(
    input: { batch: SourceBatch; plan: ReconciliationPlan },
    context: RequestContext,
  ): Promise<CommitReceipt>;
}
export interface CoordinatorService {
  /** Pure reconciliation, no persistence/model calls; preserves evidence/visibility/identity. */
  plan(input: {
    previous: CampusEvent[];
    batch: ValidationReport<CampusEvent>;
    revision: string;
    proposals: MergeProposal[];
  }): ReconciliationPlan;
  /** Fetch/normalize/propose/validate/commit; external reads, optional model budget, transactional writes. */
  refresh(
    input: { sources: string[] },
    context: RequestContext,
  ): Promise<{ commits: CommitReceipt[]; failures: ApiError[] }>;
}
export interface ExtractionService {
  /** May consume AI budget; returns evidence-backed proposals, NEVER commits facts or changes visibility. */
  extract(
    input: { records: SourceRecord[]; candidates: CampusEvent[] },
    context: RequestContext,
  ): Promise<MergeProposal[]>;
}
export interface SchedulingService {
  /** Pure interval evaluation; unknown data never becomes confirmed availability. */
  evaluate(input: {
    events: CampusEvent[];
    profile: Profile;
  }): { eventId: Id; fit: Fit }[];
  /** Pure draft normalization/validation; no persistence. */
  preview(input: AvailabilityInput): Profile;
}
export interface RecommendationService {
  /** Pure scoring/filtering over validated records and explicit time. No provider reads or writes. */
  rank(input: {
    events: CampusEvent[];
    profile: Profile;
    saved: Id[];
    feedback: Record<Id, number>;
    now: Instant;
  }): Recommendation[];
}
export interface PrivateContextService {
  /** Reads caller-authorized context; may decrypt internally, never returns tokens. */
  read(context: RequestContext): Promise<PrivateContextView[]>;
  /** Reads provider and replaces scoped context; no writes to public event store. */
  sync(
    input: { provider: Provider },
    context: RequestContext,
  ): Promise<SyncResult>;
  /** Deletes scoped local context; caller coordinates remote revocation separately. */
  remove(
    input: { provider: Provider },
    context: RequestContext,
  ): Promise<{ deleted: boolean }>;
}
export interface AssistantService {
  /** Reads authorized evidence, may call AI/store conversation; NEVER mutates event facts or external calendars. */
  answer(
    input: { query: string; conversationId?: Id },
    context: RequestContext,
  ): Promise<AssistantReply>;
}
export interface AnalyticsService {
  /** Appends pseudonymous outbox item; requestId is deduplication identity. */
  enqueue(
    input: { kind: AnalyticsKind; eventId: Id },
    context: RequestContext,
  ): Promise<{ queued: boolean }>;
  /** External delivery + outbox retry state updates; deletion suppression enforced. */
  flush(
    context: RequestContext,
  ): Promise<{ delivered: number; deferred: number }>;
  /** Persists suppression, removes queued data, requests eventual external deletion. */
  erase(
    context: RequestContext,
  ): Promise<{ localDeleted: boolean; remotePending: boolean }>;
}
export interface BackendModules {
  narration: NarrationService;
  discordPolicy: DiscordPolicyService;
  sources: Record<string, SourceAdapter>;
  events: EventRepository;
  coordinator: CoordinatorService;
  extraction: ExtractionService;
  scheduling: SchedulingService;
  recommendations: RecommendationService;
  privateContext: PrivateContextService;
  assistant: AssistantService;
  analytics: AnalyticsService;
  profiles: ProfileRepository;
  preferences: PreferenceRepository;
  identity: IdentityService;
  connections: ConnectionService;
  calendar: CalendarService;
  conversations: ConversationRepository;
  clubs: ClubService;
  news: NewsService;
  jobs: JobService;
}

export interface ProfileRepository {
  /** Scoped read with server defaults; no writes. */
  get(context: RequestContext): Promise<Profile>;
  /** Validates/persists allowed profile fields; returns stored state. */
  replace(input: Profile, context: RequestContext): Promise<Profile>;
  /** Removes caller profile; does not remove provider records. */
  delete(context: RequestContext): Promise<{ deleted: boolean }>;
}
export interface PreferenceRepository {
  /** Scoped read, no writes. */
  read(
    context: RequestContext,
  ): Promise<{ saved: Id[]; feedback: Record<Id, number> }>;
  /** Idempotent desired-state update; validates event existence, returns applied state. */
  setSaved(
    input: { eventId: Id; saved: boolean },
    context: RequestContext,
  ): Promise<{ saved: boolean }>;
  /** Upserts preference; no AI or provider calls. */
  setFeedback(
    input: { eventId: Id; value: -1 | 1 },
    context: RequestContext,
  ): Promise<{ ok: boolean }>;
}
export interface IdentityService {
  /** Resolves opaque session credential; no business mutations. Never expose credential in returned DTO. */
  resolveSession(input: { credential: string }): Promise<UserSummary | null>;
  /** Checks authorization for data/action; throws forbidden. No writes. */
  authorize(
    input: { action: string; visibility: Visibility },
    context: RequestContext,
  ): Promise<void>;
  /** Coordinates irreversible account erasure/revocation/outbox suppression; requires recent session. */
  deleteAccount(
    input: { confirmation: "DELETE" },
    context: RequestContext,
  ): Promise<{ deleted: boolean; remoteCleanupPending: boolean }>;
}
export interface ConnectionService {
  /** Reads scoped status, excludes credentials. */
  list(context: RequestContext): Promise<ConnectionView[]>;
  /** Persists expiring state/PKCE; no connection established until callback. */
  begin(
    input: { provider: Provider },
    context: RequestContext,
  ): Promise<{ url: string }>;
  /** Atomically consumes state, exchanges code, encrypts tokens. Never returns tokens. */
  finish(
    input: { provider: Provider; state: string; code: string },
    context: RequestContext,
  ): Promise<ConnectionView>;
  /** Deletes local connection/context, attempts remote revocation, reports outcome. */
  disconnect(
    input: { provider: Provider },
    context: RequestContext,
  ): Promise<{ disconnected: boolean; revoked: boolean }>;
}
export interface CalendarService {
  /** Pure export serialization; no external writes. */
  export(input: { event: CampusEvent }): string;
  /** Stores draft; preserves unknown times and returns validation warnings. */
  prepare(
    input: { eventId: Id; destination: CalendarProvider },
    context: RequestContext,
  ): Promise<CalendarDraft>;
  /** Validates/revises draft under optimistic concurrency; no provider write. */
  revise(
    input: { draft: CalendarDraft; expectedRevision: string },
    context: RequestContext,
  ): Promise<CalendarDraft>;
  /** Explicit confirmation + idempotency key; persists receipt and provider write outcome. */
  commit(
    input: { draftId: Id; revision: string; confirmed: true; requestId: Id },
    context: RequestContext,
  ): Promise<JobReceipt>;
}
export interface ConversationRepository {
  /** Scoped read; no writes. */
  messages(
    input: PageRequest & { conversationId: Id },
    context: RequestContext,
  ): Promise<Page<ChatMessage>>;
  /** Appends message exactly once by message ID; no AI/provider calls. */
  append(input: ChatMessage, context: RequestContext): Promise<ChatMessage>;
  /** Deletes conversation/messages; returns separately retained memory IDs. */
  delete(
    input: { conversationId: Id },
    context: RequestContext,
  ): Promise<{ deleted: boolean; retainedMemoryIds: Id[] }>;
  /** Scoped memory read; no writes. */
  memories(input: PageRequest, context: RequestContext): Promise<Page<Memory>>;
  /** Writes caller-approved memory; no inferred private facts without consent. */
  putMemory(input: Memory, context: RequestContext): Promise<Memory>;
  /** Deletes memory and retrieval entries; idempotent. */
  deleteMemory(
    input: { memoryId: Id },
    context: RequestContext,
  ): Promise<{ deleted: boolean }>;
}
export interface ClubService {
  /** Reads indexed clubs; no provider/model calls. */
  search(
    input: PageRequest & { query?: string },
    context: RequestContext,
  ): Promise<Page<Club>>;
  /** Worker-only enrichment: external reads/model budget + evidence-backed storage; visibility preserved. */
  refresh(
    input: { clubIds: Id[] },
    context: RequestContext,
  ): Promise<JobReceipt>;
}
export interface NewsService {
  /** Reads authorized stored articles; no provider calls. */
  list(
    input: PageRequest & { eventId?: Id; clubId?: Id },
    context: RequestContext,
  ): Promise<Page<NewsArticle>>;
  /** Worker-only provider read, deduplication and storage; never fabricates source evidence. */
  refresh(
    input: { since?: Instant },
    context: RequestContext,
  ): Promise<JobReceipt>;
}
export interface JobService {
  /** Worker-only enqueue; idempotent requestId, persists job. */
  enqueue(
    input: {
      kind: "sources" | "private_context" | "analytics" | "clubs" | "news";
      requestId: Id;
    },
    context: RequestContext,
  ): Promise<JobReceipt>;
  /** Claims job lease, performs declared effects, persists retries/outcome. */
  run(input: { jobId: Id }, context: RequestContext): Promise<JobReceipt>;
  /** Scoped status read; no implicit retry. */
  get(input: { jobId: Id }, context: RequestContext): Promise<JobReceipt>;
}

/** Binary HTTP transport DTO. ArrayBuffer is opaque bytes, not JSON or provider objects. */
export interface AudioData {
  bytes: ArrayBuffer;
  contentType: string;
}
export interface DiscordGuild extends Extensible {
  id: Id;
  name: string;
}
export interface DiscordServerSettings extends Extensible {
  channels: DiscordChannel[];
  selected: Id[];
}
export interface NarrationService {
  /** Reads public event records, reserves spend, uses provider/cache; returns audio, never private context. */
  narrate(
    input: { eventIds: Id[] },
    context: RequestContext,
  ): Promise<AudioData>;
}
export interface DiscordPolicyService {
  /** Verifies caller's owner status via provider; returns minimal guild data. */
  ownedServers(context: RequestContext): Promise<DiscordGuild[]>;
  /** Checks current owner and reads allowed channels/config; no writes. */
  settings(
    input: { guildId: Id },
    context: RequestContext,
  ): Promise<DiscordServerSettings>;
  /** Persists validated owner policy and invalidates dependent caches. */
  configure(
    input: { guildId: Id; channels: Id[] },
    context: RequestContext,
  ): Promise<{ ok: boolean }>;
}

/** Server bot boundary; independent of app-user identity and legacy Discord OAuth. */
export interface DiscordBotCommand {
  interactionId: Id;
  guildId: Id;
  channelId: Id;
  actorId: Id;
  action: "watch" | "unwatch" | "ignore" | "submit";
  messageId?: Id;
}
export interface DiscordBotReceipt {
  content: string;
}
export interface DiscordBotRepository {
  /** Trusted, signature/permission-validated command only. Atomically updates public channel policy or exclusion and stores an interaction receipt. Replays return the receipt without repeating effects. No provider or model calls. Database failure commits nothing. */
  apply(command: DiscordBotCommand): Promise<DiscordBotReceipt>;
  /** Reads policy and exclusions; watched channels or explicitly submitted messages qualify; exclusions always win. No writes or AI. Text exclusion must also be checked by the caller before any model/storage operation. */
  eligible(input: {
    guildId: Id;
    channelId: Id;
    messageId: Id;
  }): Promise<boolean>;
}

/** Public Discord text after transport normalization; contains no author profile, token, attachments or reply history. */
export interface DiscordCollectedMessage {
  guildId: Id;
  channelId: Id;
  messageId: Id;
  text: string;
  createdAt: Instant;
  editedAt: Instant | null;
  sourceUrl: string;
}
/** A qualified proposal, not a canonical event or permission to write calendars. Date-only until time interpretation is implemented. */
export interface DiscordEventCandidate {
  /** Explanation for a date inferred from the message's original posting time. Absent for explicit full dates. */
  dateReasoning?: string;
  date: LocalDate;
  title: string;
  description: string;
  location: string | null;
  onlineUrl: string | null;
  isOnline: boolean;
  evidence: {
    date: string;
    title: string;
    location: string | null;
    online: string | null;
  };
}
export interface DiscordReadTarget {
  guildId: Id;
  channelId: Id;
  messageId?: Id;
}
export interface DiscordScanState {
  cursor?: Id;
  before?: Id;
  head?: Id;
}
export interface DiscordCollectionRepository {
  /** Fair bounded read of watched channels; never reads private/OAuth records. */
  channels(
    limit: number,
  ): Promise<(DiscordReadTarget & { scan: DiscordScanState })[]>;
  /** Fair bounded union of manual references and previously collected records to detect edits/deletions. */
  messages(limit: number): Promise<DiscordReadTarget[]>;
  /** Read existing fingerprint/status; no content returned to callers. */
  unchanged(target: DiscordReadTarget, fingerprint: string): Promise<boolean>;
  /** Rechecks consent/exclusions in a transaction, replaces this message's staged candidate and content. Does not publish globally. Revisions invalidate previous proposals. */
  save(
    message: DiscordCollectedMessage,
    fingerprint: string,
    candidate: DiscordEventCandidate | null,
    status: "qualified" | "rejected" | "pending",
  ): Promise<void>;
  /** Purges text and staged candidate for a deleted/excluded/inaccessible message. No Discord writes. */
  remove(target: DiscordReadTarget): Promise<void>;
  /** Advances a successfully processed channel scan; failure leaves cursor intact. */
  checkpoint(target: DiscordReadTarget, scan: DiscordScanState): Promise<void>;
  /** Marks reference checked, for fair edit/delete revalidation. No provider/model call. */
  checked(target: DiscordReadTarget): Promise<void>;
  /** Atomic lease; prevents overlapping collectors across processes. */
  acquire(): Promise<boolean>;
  /** Releases the lease owned by this worker. */
  release(): Promise<void>;
  /** Atomic daily reservation before extraction; fails closed on unavailable storage. No refund/retry after uncertain spending. */
  reserveAI(limit: number): Promise<boolean>;
  /** Atomic global/server/hour/message/revision reservation before inference. Denial increments nothing. Failed calls retain reservations; no automatic refund. */
  reserveExtraction(input: DiscordExtractionReservation): Promise<boolean>;
}
export interface DiscordExtractionReservation {
  guildId: Id;
  channelId: Id;
  messageId: Id;
  fingerprint: string;
  limits: DiscordExtractionLimits;
}
export interface DiscordExtractionLimits {
  /** When true, only guildDaily/guildHourly are spending caps. Legacy fields remain for older callers. Absence retains the previous policy. */
  serverOnly?: boolean;
  globalDaily: number;
  guildDaily: number;
  guildHourly: number;
  messageDaily: number;
}
export interface DiscordCollectionInspection {
  listenerStatus?:
    "connected" | "starting" | "disconnected" | "disabled" | "error";
  guildId: Id;
  channelId: Id;
  watching: boolean;
  collectionEnabled: boolean;
  aiEnabled: boolean;
  limits: DiscordExtractionLimits;
  usage: { globalDaily: number; guildDaily: number; guildHourly: number };
  messages: {
    messageId: Id;
    sourceUrl: string;
    preview: string;
    status: "pending" | "qualified" | "rejected";
    eventTitle?: string;
    eventDate?: LocalDate;
  }[];
}
export interface DiscordInspectionService {
  /** Read-only inspection for a Discord-signed server admin with current channel read access. Scope comes from the interaction, never arbitrary command arguments. No AI, refresh, or writes. */
  inspect(input: {
    guildId: Id;
    channelId: Id;
  }): Promise<DiscordCollectionInspection>;
}
export interface DiscordMessageReader {
  /** Bot-authenticated GET only. Validates channel/guild identity; returns newest-first page. 404/403 become unavailable, 429 pauses work. */
  list(
    target: DiscordReadTarget,
    before?: Id,
  ): Promise<DiscordCollectedMessage[]>;
  /** GET exactly one designated message, not its neighboring history. */
  get(target: DiscordReadTarget): Promise<DiscordCollectedMessage | null>;
}
export interface DiscordTextExtractor {
  /** Public text only; bounded model inference without tools. Output is untrusted and must pass deterministic evidence/date/location validation. May spend reserved budget. */
  propose(text: string, context?: DiscordExtractionContext): Promise<unknown>;
}
/** Trusted provider metadata, never taken from announcement instructions. */
export interface DiscordExtractionContext {
  postedAt: Instant;
  timezone: string;
}

/** Authenticated club administration workspace; creation does not claim imported identities. */
export interface ManagedClub extends Extensible {
  id: Id;
  name: string;
  discordGuildId: Id | null;
}
export interface ClubWorkspace {
  /** Backend-prepared edit forms for already published events. Missing means editing unavailable. */
  editableEvents?: ClubEventEdit[];
  club: ManagedClub;
  events: CampusEvent[];
  candidates: {
    messageId: Id;
    sourceUrl: string;
    candidate: DiscordEventCandidate;
  }[];
}
export interface CreateManagedClubInput {
  name: string;
  requestId: string;
  discordTicket?: string;
}
export interface ClubAccountService {
  /** Session-derived user only. Reads owned clubs; no provider, AI or writes. */
  list(userId: Id): Promise<{ clubs: ManagedClub[]; canCreate?: boolean }>;
  /** Validates name/ticket. Atomically creates new identity and owner membership, optionally binds guild and consumes ticket. Idempotent by user/requestId. Never claims imported clubs. Invalid/expired/used tickets fail without creating a club. */
  create(userId: Id, input: CreateManagedClubInput): Promise<ManagedClub>;
  /** Owner-scoped event/candidate read; forbidden for other users. No refresh or model calls. */
  workspace(userId: Id, clubId: Id): Promise<ClubWorkspace>;
  /** Consumes short-lived ticket and binds guild to an existing caller-owned club atomically. Same owner/club retry is safe; conflicting bindings fail. */
  link(
    userId: Id,
    input: { clubId: Id; discordTicket: string },
  ): Promise<ManagedClub>;
}
export interface DiscordClubSetupService {
  /** Trusted signed guild admin only. Issues a ten-minute bearer capability, stored hashed, returned only in private response. No Discord mutations or AI. */
  setup(input: { guildId: Id; actorId: Id }): Promise<{ url: string }>;
  /** Reads whether a guild has an active club owner. No writes/AI. */
  linked(guildId: Id): Promise<boolean>;
}

export interface ClubEventValues {
  title: string;
  description: string;
  date: LocalDate;
  location: string | null;
  onlineUrl: string | null;
  isOnline: boolean;
}
export interface ClubEventEdit {
  eventId: Id;
  revision: string;
  values: ClubEventValues;
}
export interface DiscordPublicationService {
  /** Reads qualified records, revalidates evidence and current consent, and projects published events with stable IDs and owner corrections. No AI/provider calls or writes. No approval stage. */
  list(input?: {
    includePast?: boolean;
  }): Promise<{ event: CampusEvent; edit: ClubEventEdit }[]>;
  /** Session-derived owner only. Edits an already-published event, checks revision, atomically stores correction and audit record. No creation, provider/calendar writes or AI. Invalid, stale, withdrawn or unauthorized requests fail. */
  edit(userId: Id, input: ClubEventEdit): Promise<CampusEvent>;
}

export interface DiscordMessageTrigger extends DiscordReadTarget {
  messageId: Id;
  kind: "upsert" | "delete";
}
export interface DiscordMessageJob extends DiscordReadTarget {
  messageId: Id;
  revision: string;
  leaseOwner: string;
}
export interface DiscordTriggerQueue {
  /** Trusted Gateway/command IDs only. Coalesces work durably; stores IDs, not message text. Rechecks eligibility before enqueue. */
  enqueue(target: DiscordReadTarget, delayMs: number): Promise<void>;
  /** Permanent withdrawal for provider-deleted messages; serializes with candidate writes. No provider/AI calls. */
  withdraw(target: DiscordReadTarget): Promise<void>;
  /** Claims one due ID-only job with a bounded lease; null if idle. */
  claim(): Promise<DiscordMessageJob | null>;
  /** Completes/reschedules the claimed revision without deleting newer edits. No AI; safe after crashes via lease expiry. */
  finish(job: DiscordMessageJob, retryMs?: number): Promise<void>;
}
