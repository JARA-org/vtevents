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
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || "The backend is unavailable. Please try again.",
    );
  }
  if (response.headers.get("content-type")?.includes("audio/")) {
    return {
      bytes: await response.arrayBuffer(),
      contentType: response.headers.get("content-type")!,
    } as HttpApi[K]["output"];
  }
  return (
    response.headers.get("content-type")?.includes("text/calendar")
      ? await response.text()
      : await response.json()
  ) as HttpApi[K]["output"];
}
const id = encodeURIComponent;
export const backend: BackendClient = {
  editClubEvent: ({ eventId, ...input }) =>
    request<"editClubEvent">(`/clubs/events/${id(eventId)}`, "PATCH", input),
  myClubs: () => request<"myClubs">("/clubs/mine"),
  createClub: (input) => request<"createClub">("/clubs", "POST", input),
  linkClubDiscord: (input) =>
    request<"linkClubDiscord">("/clubs/discord", "POST", input),
  clubWorkspace: (input) =>
    request<"clubWorkspace">(`/clubs/${id(input.clubId)}/workspace`),
  narrate: (input) => request<"narrate">("/narration", "POST", input),
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
  exportCalendar: (input) =>
    request<"exportCalendar">(`/events/${id(input.eventId)}/ics`),
  getAccount: () => request<"getAccount">("/me"),
  updateProfile: (input) => request<"updateProfile">("/profile", "PUT", input),
  validateProfile: (input) =>
    request<"validateProfile">("/profile/validate", "POST", input),
  previewAvailability: (input) =>
    request<"previewAvailability">("/availability/preview", "POST", input),
  getRecommendations: () => request<"getRecommendations">("/recommendations"),
  discover: (input) => request<"discover">("/discovery", "POST", input),
  setSaved: ({ eventId, saved }) =>
    request<"setSaved">(`/saved/${id(eventId)}`, "PUT", { saved }),
  submitFeedback: (input) =>
    request<"submitFeedback">("/feedback", "POST", input),
  askAssistant: (input) => request<"askAssistant">("/assistant", "POST", input),
  track: (input) => request<"track">("/analytics", "POST", input),
  listConnections: () => request<"listConnections">("/connections"),
  connect: (input) =>
    request<"connect">(
      `/connections/${id(input.provider)}/connect`,
      "POST",
      {},
    ),
  syncConnection: (input) =>
    request<"syncConnection">(
      `/connections/${id(input.provider)}/sync`,
      "POST",
      {},
    ),
  disconnect: (input) =>
    request<"disconnect">(`/connections/${id(input.provider)}`, "DELETE"),
  listDiscordChannels: () =>
    request<"listDiscordChannels">("/discord/channels"),
  selectDiscordChannels: (input) =>
    request<"selectDiscordChannels">("/discord/channels", "PUT", input),
  getPrivateContext: () => request<"getPrivateContext">("/private-context"),
  addCalendar: (input) => request<"addCalendar">("/calendar", "POST", input),
  deleteAccount: (input) =>
    request<"deleteAccount">("/account", "DELETE", input),
  signUp: (input) => request<"signUp">("/auth/sign-up/email", "POST", input),
  signIn: (input) => request<"signIn">("/auth/sign-in/email", "POST", input),
  signOut: (input) => request<"signOut">("/auth/sign-out", "POST", input),
};
