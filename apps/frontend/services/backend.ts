/** Transport only. No scoring, validation, provider calls, fixtures, or fallback business logic. */
import type { BackendClient, HttpApi } from "@gobbler/shared";

async function request<K extends keyof HttpApi>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<HttpApi[K]["output"]> {
  const response = await fetch("/api" + path, {
    credentials: "include",
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error(
      "We can’t reach My Gobbler right now. Check your connection and try again.",
    );
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = typeof error.message === "string" ? error.message : "";
    const friendly =
      response.status >= 500
        ? "We couldn’t finish that request. Give us a moment, then try again."
        : response.status === 429
          ? "A few too many requests at once. Wait a moment, then try again."
          : path === "/auth/sign-in/email" && response.status === 401
            ? "We couldn’t sign you in. Check your email and password, then try again."
            : /invalid email/i.test(message)
              ? "That email looks incomplete. Enter your email address and try again."
              : /password.*short|password.*12/i.test(message)
                ? "Your password needs at least 12 characters. Add a few more and try again."
                : /already exists|already registered|email.*taken/i.test(
                      message,
                    )
                  ? "That email already has a Gobbler account. Try signing in instead."
                  : message ||
                    "We couldn’t finish that request. Check your details and try again.";
    throw new Error(friendly);
  }
  return await response.json() as HttpApi[K]["output"];
}
const id = encodeURIComponent;
export const backend: BackendClient = {
  getMemory: () => request<"getMemory">("/memory"),
  setAttendance: ({ eventId, attended }) =>
    request<"setAttendance">(`/memory/attendance/${id(eventId)}`, "PUT", {
      attended,
    }),
  forgetMemory: (input) => request<"forgetMemory">("/memory", "DELETE", input),
  searchPublicMemory: ({query}) => request<"searchPublicMemory">(`/public-memory?q=${encodeURIComponent(query)}`),
  listDeadlines: () => request<"listDeadlines">("/deadlines"),
  accountEmail: () => request<"accountEmail">("/account-email"),
  requestPasswordReset: (input) =>
    request<"requestPasswordReset">(
      "/auth/request-password-reset",
      "POST",
      input,
    ),
  resetPassword: (input) =>
    request<"resetPassword">("/auth/reset-password", "POST", input),
  sendVerificationEmail: (input) =>
    request<"sendVerificationEmail">(
      "/auth/send-verification-email",
      "POST",
      input,
    ),
  editClubEvent: ({ eventId, ...input }) =>
    request<"editClubEvent">(`/clubs/events/${id(eventId)}`, "PATCH", input),
  myClubs: () => request<"myClubs">("/clubs/mine"),
  createClub: (input) => request<"createClub">("/clubs", "POST", input),
  linkClubDiscord: (input) =>
    request<"linkClubDiscord">("/clubs/discord", "POST", input),
  clubWorkspace: (input) =>
    request<"clubWorkspace">(`/clubs/${id(input.clubId)}/workspace`),
  listOwnedDiscordServers: () =>
    request<"listOwnedDiscordServers">("/discord/owned-servers"),
  getDiscordServer: (input) =>
    request<"getDiscordServer">(`/discord/servers/${id(input.guildId)}`),
  configureDiscordServer: ({ guildId, channels }) =>
    request<"configureDiscordServer">(
      `/discord/servers/${id(guildId)}`,
      "PUT",
      { channels },
    ),
  health: () => request<"health">("/health"),
  bootstrap: () => request<"bootstrap">("/bootstrap"),
  listEvents: (input) => request<"listEvents">(`/events?mode=${input.mode}`),
  getAccount: () => request<"getAccount">("/me"),
  updateProfile: (input) => request<"updateProfile">("/profile", "PUT", input),
  validateProfile: (input) =>
    request<"validateProfile">("/profile/validate", "POST", input),
  getRecommendations: () => request<"getRecommendations">("/recommendations"),
  timeline: (input) => request<"timeline">("/timeline", "POST", input),
  discover: (input) => request<"discover">("/discovery", "POST", input),
  setSaved: ({ eventId, saved }) =>
    request<"setSaved">(`/saved/${id(eventId)}`, "PUT", { saved }),
  submitFeedback: (input) =>
    request<"submitFeedback">("/feedback", "POST", input),
  assistantMemories: () => request<"assistantMemories">("/assistant/memories"),
  confirmAssistantMemory: (input) => request<"confirmAssistantMemory">("/assistant/memories", "POST", input),
  editAssistantMemory: ({ id: memoryId, ...input }) => request<"editAssistantMemory">(`/assistant/memories/${id(memoryId)}`, "PATCH", input),
  deleteAssistantMemory: ({ id: memoryId }) => request<"deleteAssistantMemory">(`/assistant/memories/${id(memoryId)}`, "DELETE"),
  chatAssistant: (input) => request<"chatAssistant">("/assistant/chat", "POST", input),
  askAssistant: (input) => request<"askAssistant">("/assistant", "POST", input),
  track: (input) => request<"track">("/analytics", "POST", input),
  listDiscordChannels: () =>
    request<"listDiscordChannels">("/discord/channels"),
  selectDiscordChannels: (input) =>
    request<"selectDiscordChannels">("/discord/channels", "PUT", input),
  deleteAccount: (input) =>
    request<"deleteAccount">("/account", "DELETE", input),
  signUp: (input) => request<"signUp">("/auth/sign-up/email", "POST", input),
  signIn: (input) => request<"signIn">("/auth/sign-in/email", "POST", input),
  signOut: (input) => request<"signOut">("/auth/sign-out", "POST", input),
};
