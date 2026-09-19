import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Image,
  StyleSheet,
  useWindowDimensions,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CampusEvent,
  Profile,
  categories,
  emptyProfile,
  demoProfile,
  demoEvents,
  recommendations,
  scheduleFit,
  eventICS,
  CAMPUS_TZ,
  questionFilter,
  filterQuestion,
} from "@gobbler/shared";
import { DateTime } from "luxon";

const C = {
  ink: "#30232B",
  muted: "#746770",
  maroon: "#6B183B",
  orange: "#D44C19",
  cream: "#FFF8EC",
  paper: "#FBFAF7",
  line: "#E8E1DE",
  green: "#28684C",
  pink: "#F5E9EC",
};
type Page =
  | "landing"
  | "discover"
  | "saved"
  | "schedule"
  | "gobbler"
  | "settings"
  | "onboarding"
  | "auth";
const eventTime = (e: CampusEvent) =>
  e.timeTBD
    ? date(e.start, "ccc, LLL d") + " · Time TBD"
    : e.allDay
      ? date(e.start, "ccc, LLL d") + " · All day"
      : date(e.start);
const date = (s: string, fmt = "ccc, LLL d · h:mm a") =>
  DateTime.fromISO(s).setZone(CAMPUS_TZ).toFormat(fmt);
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW_ONLY === "true";
function DiscordOwnerSettings() {
  const [guilds, setGuilds] = useState<any[] | null>(null),
    [guild, setGuild] = useState<any>(null),
    [channels, setChannels] = useState<any[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await task();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Discord is unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.label}>For server owners</Text>
      <Text style={s.meta}>
        Install Gobbler in your server, then choose its announcement channels.
        Only channels visible to every server member are supported in V1.
        Students choose which approved channels to follow.
      </Text>
      <Button
        secondary
        disabled={busy}
        label={busy ? "Loading…" : "Manage my servers"}
        onPress={() =>
          action(async () => {
            setGuilds((await api("/discord/owned-servers")).guilds);
            setGuild(null);
          })
        }
      />
      {guilds?.length === 0 && (
        <Text style={s.meta}>
          No owned Discord servers found for this connection.
        </Text>
      )}
      {guilds?.map((g) => (
        <Button
          key={g.id}
          secondary
          disabled={busy}
          label={g.name}
          onPress={() =>
            action(async () => {
              const result = await api("/discord/servers/" + g.id);
              setGuild(g);
              setChannels(result.channels);
              setSelected(result.selected);
            })
          }
        />
      ))}
      {guild && (
        <View style={{ gap: 10 }}>
          <Text style={s.label}>{guild.name} · approved channels</Text>
          {!channels.length && (
            <Text style={s.meta}>
              No eligible announcement channels. Check the bot installation and
              channel permissions.
            </Text>
          )}
          {channels.map((ch) => (
            <Chip
              key={ch.id}
              label={"#" + ch.name}
              active={selected.includes(ch.id)}
              onPress={() => {
                if (!busy)
                  setSelected((old) =>
                    old.includes(ch.id)
                      ? old.filter((id) => id !== ch.id)
                      : [...old, ch.id],
                  );
              }}
            />
          ))}
          <Text style={s.meta}>
            Saving an empty selection stops announcement reads for this server.
          </Text>
          <Button
            disabled={busy}
            label="Save server channels"
            onPress={() =>
              action(async () => {
                await api(
                  "/discord/servers/" + guild.id,
                  { channels: selected },
                  "PUT",
                );
                setNotice(
                  "Server choices saved. Students can now choose approved channels.",
                );
              })
            }
          />
        </View>
      )}
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={s.meta}>
          {notice}
        </Text>
      )}
    </View>
  );
}

function GobblerVoice({ ids, enabled }: { ids: string[]; enabled: boolean }) {
  const [audioUrl, setAudioUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const selection = ids.slice(0, 3).join("|");
  useEffect(() => {
    setAudioUrl("");
    setNotice("");
  }, [selection]);
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  if (Platform.OS !== "web" || !ids.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Button
        label={busy ? "Preparing Gobbler’s voice…" : "Listen to Gobbler"}
        icon="volume-high-outline"
        secondary
        disabled={!enabled || busy || !!audioUrl}
        onPress={async () => {
          setBusy(true);
          setNotice("");
          try {
            const r = await fetch("/api/narration", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ eventIds: ids.slice(0, 3) }),
            });
            if (!r.ok) {
              const error = await r.json();
              throw new Error(error.message || "Voice is unavailable.");
            }
            setAudioUrl(URL.createObjectURL(await r.blob()));
            setNotice("Your audio is ready. Press play to listen.");
          } catch (e) {
            setNotice(
              e instanceof Error
                ? e.message
                : "Voice is unavailable. You can still read the events below.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      <Text style={s.meta}>
        {enabled
          ? "Reads the first three public event summaries using ElevenLabs. Your question and private schedule are not sent."
          : "ElevenLabs narration is available for signed-in students when the voice service is connected. The demo stays separate."}
      </Text>
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={s.meta}>
          {notice}
        </Text>
      )}
      {!!audioUrl &&
        React.createElement("audio", {
          controls: true,
          src: audioUrl,
          "aria-label": "Gobbler event narration",
          style: { maxWidth: "100%", width: 360 },
        })}
      <Text
        accessibilityRole="link"
        style={[s.meta, { textDecorationLine: "underline" }]}
        onPress={() => Linking.openURL("https://elevenlabs.io")}
      >
        Voice powered by ElevenLabs
      </Text>
    </View>
  );
}
async function api(path: string, body?: any, method?: string) {
  if (PREVIEW) {
    if (path === "/health") return { accounts: false, gemini: false };
    if (path.startsWith("/events?")) {
      if (path.includes("mode=demo"))
        return { mode: "demo", events: demoEvents(), sources: {} };
      const snapshot = await fetch("/campus-events.json");
      if (!snapshot.ok)
        throw new Error(
          "Public event snapshot is unavailable. The sample demo is still available.",
        );
      return snapshot.json();
    }
    throw new Error(
      "Accounts and connections are not enabled on this preview deployment.",
    );
  }
  const r = await fetch("/api" + path, {
    credentials: "include",
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.message || "Could not complete that request.");
  return data;
}
function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: any;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.buttonSecondary,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={18}
          color={secondary ? C.maroon : "white"}
        />
      )}
      <Text style={[s.buttonText, secondary && { color: C.maroon }]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.chip, active && s.activeChip]}
    >
      <Text style={[s.chipText, active && { color: "white" }]}>{label}</Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (x: string) => void;
  placeholder?: string;
  secure?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        secureTextEntry={secure}
        autoCapitalize="none"
      />
    </View>
  );
}
const mascot = require("../assets/gobbler-mascot.png");
function Gobbler({ size = 64 }: { size?: number }) {
  return (
    <Image
      source={mascot}
      accessibilityLabel="Gobbler, a friendly turkey wearing a backpack"
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
export default function Home() {
  const { width } = useWindowDimensions(),
    mobile = width < 800;
  const impressions = useRef(new Set<string>());
  const [page, setPage] = useState<Page>("landing"),
    [mode, setMode] = useState<"demo" | "live">("live"),
    [user, setUser] = useState<any>(null),
    [profile, setProfile] = useState<Profile>(emptyProfile),
    [events, setEvents] = useState<CampusEvent[]>([]),
    [saved, setSaved] = useState<string[]>([]),
    [feedback, setFeedback] = useState<Record<string, number>>({}),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All interests"),
    [dateFilter, setDateFilter] = useState("Any day"),
    [selected, setSelected] = useState<CampusEvent | null>(null),
    [calendar, setCalendar] = useState(false),
    [destination, setDestination] = useState("ics"),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [connections, setConnections] = useState<any[]>([]),
    [sources, setSources] = useState<any>({}),
    [health, setHealth] = useState<any>({}),
    [query, setQuery] = useState(""),
    [answer, setAnswer] = useState<any>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signUp, setSignUp] = useState(true),
    [name, setName] = useState(""),
    [weekday, setWeekday] = useState(1),
    [blockStart, setBlockStart] = useState("17:00"),
    [blockEnd, setBlockEnd] = useState("22:00"),
    [blockKind, setBlockKind] = useState<"free" | "busy">("free"),
    [busyDate, setBusyDate] = useState(
      DateTime.now().setZone(CAMPUS_TZ).toISODate()!,
    ),
    [deleteText, setDeleteText] = useState(""),
    [privateContext, setPrivateContext] = useState<any[]>([]),
    [discordChannels, setDiscordChannels] = useState<any[]>([]),
    [rankedLive, setRankedLive] = useState<any[] | null>(null);
  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 5000);
  };
  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  const go = (p: Page) => {
    setPage(p);
    setSelected(null);
    setCalendar(false);
    setError("");
    if (Platform.OS === "web") {
      document.title = `${p === "landing" ? "Your little guide to campus life" : p.charAt(0).toUpperCase() + p.slice(1)} · My Little Gobbler`;
    }
  };
  const loadEvents = async (m: string) => {
    const data =
      m === "demo"
        ? { events: demoEvents(), sources: {} }
        : await api("/events?mode=" + m);
    setEvents(data.events);
    setSources(data.sources);
  };
  const loadMe = async () => {
    const me = await api("/me");
    setUser(me.user);
    setProfile(me.profile);
    setSaved(me.saved);
    setFeedback(me.feedback);
    return me;
  };
  useEffect(() => {
    api("/health")
      .then(setHealth)
      .catch(() => {});
    api("/me")
      .then((me) => {
        setUser(me.user);
        setProfile(me.profile);
        setSaved(me.saved);
        setFeedback(me.feedback);
        setPage(
          me.profile.onboarded
            ? Platform.OS === "web" &&
              new URLSearchParams(location.search).get("page") === "settings"
              ? "settings"
              : "discover"
            : "onboarding",
        );
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (page !== "landing" && page !== "auth") void run(() => loadEvents(mode));
  }, [mode, page === "landing", page === "auth"]);
  useEffect(() => {
    if (mode === "demo") {
      try {
        const p = localStorage.getItem("gobbler-demo-profile"),
          sv = localStorage.getItem("gobbler-demo-saved");
        setProfile(p ? JSON.parse(p) : demoProfile);
        setSaved(sv ? JSON.parse(sv) : []);
      } catch {
        setProfile(demoProfile);
      }
    }
  }, [mode]);
  useEffect(() => {
    if (mode === "demo") {
      try {
        localStorage.setItem("gobbler-demo-profile", JSON.stringify(profile));
        localStorage.setItem("gobbler-demo-saved", JSON.stringify(saved));
      } catch {}
    }
  }, [profile, saved]);
  useEffect(() => {
    if (
      user &&
      mode === "live" &&
      ["discover", "schedule", "saved"].includes(page)
    )
      api("/recommendations")
        .then((x) => setRankedLive(x.recommendations))
        .catch(() => setRankedLive(null));
  }, [page, profile, saved, feedback, user, mode, events]);
  useEffect(() => {
    if (page === "settings" && mode === "live" && user) {
      void run(async () => {
        const d = await api("/connections");
        setConnections(d.connections);
        setSources(d.sources);
        setPrivateContext(await api("/private-context"));
      });
    }
  }, [page]);
  const ranked = useMemo(
    () =>
      mode === "live" && rankedLive
        ? rankedLive
        : recommendations(events, profile, saved, feedback),
    [events, profile, saved, feedback, rankedLive, mode],
  );
  const filtered = ranked.filter(({ event: e }: any) => {
    const start = DateTime.fromISO(e.start).setZone(CAMPUS_TZ),
      now = DateTime.now().setZone(CAMPUS_TZ);
    return (
      (!search ||
        (e.title + " " + e.description + " " + e.location)
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (category === "All interests" || e.categories.includes(category)) &&
      (dateFilter === "Any day" ||
        (dateFilter === "Today" && start.hasSame(now, "day")) ||
        (dateFilter === "This week" && start <= now.plus({ days: 7 })) ||
        (dateFilter === "Weekend" && start.weekday >= 6))
    );
  });
  useEffect(() => {
    if (mode === "live" && user && page === "discover")
      for (const item of filtered.slice(0, 10)) {
        if (!impressions.current.has(item.event.id)) {
          impressions.current.add(item.event.id);
          api("/analytics", {
            kind: "recommendation_impression",
            eventId: item.event.id,
          }).catch(() => {});
        }
      }
  }, [events, page, mode, user, category, dateFilter]);
  const saveProfile = (p: Profile) =>
    run(async () => {
      if (mode === "live") {
        if (!user) throw new Error("Sign in to save your preferences.");
        await api("/profile", p, "PUT");
      }
      setProfile(p);
      notify("Preferences saved.");
    });
  const enterDemo = () => {
    setMode("demo");
    setProfile(demoProfile);
    setEvents(demoEvents());
    setRankedLive(null);
    go("discover");
  };
  const toggleSave = (e: CampusEvent) =>
    run(async () => {
      const next = !saved.includes(e.id);
      if (mode === "live") {
        if (!user) {
          go("auth");
          return;
        }
        await api("/saved/" + e.id, { saved: next }, "PUT");
      }
      setSaved(next ? [...saved, e.id] : saved.filter((x) => x !== e.id));
      notify(
        next ? "Saved to your little list." : "Removed from saved events.",
      );
    });
  const viewEvent = (e: CampusEvent) => {
    setSelected(e);
    setCalendar(false);
    if (user && mode === "live")
      api("/analytics", { kind: "event_view", eventId: e.id }).catch(() => {});
  };
  const download = (e: CampusEvent) => {
    if (Platform.OS === "web") {
      const url = URL.createObjectURL(
        new Blob([eventICS(e)], { type: "text/calendar;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-little-gobbler-${e.id}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      notify(
        "Calendar download started. Open the file in your calendar to finish.",
      );
    } else Linking.openURL("/api/events/" + e.id + "/ics?mode=" + mode);
  };
  function EventCard({
    item,
    compact = false,
  }: {
    item: any;
    compact?: boolean;
  }) {
    const { event: e, fit, reason } = item;
    const accent = e.categories.includes("Outdoors")
      ? "#E4EEE5"
      : e.categories.includes("Arts & music")
        ? "#F6E3D6"
        : e.categories.includes("Sports")
          ? "#F1DFE7"
          : "#EEEAF5";
    return (
      <View style={[s.eventCard, !mobile && !compact && { width: "48%" }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={"View " + e.title}
          onPress={() => viewEvent(e)}
          style={{ gap: 16 }}
        >
          <View style={[s.eventTop, { backgroundColor: accent }]}>
            <View style={s.dateStamp}>
              <Text style={s.dateMonth}>
                {date(e.start, "LLL").toUpperCase()}
              </Text>
              <Text style={s.dateDay}>{date(e.start, "d")}</Text>
            </View>
            <Ionicons
              name={
                e.categories.includes("Outdoors")
                  ? "leaf-outline"
                  : e.categories.includes("Sports")
                    ? "american-football-outline"
                    : e.categories.includes("Arts & music")
                      ? "musical-notes-outline"
                      : "sparkles-outline"
              }
              size={50}
              color={C.maroon}
            />
            <View style={s.categoryTag}>
              <Text style={s.small}>{e.categories[0] || "Campus life"}</Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 20, gap: 9 }}>
            <Text style={s.eventTitle}>{e.title}</Text>
            <Text style={s.meta}>{eventTime(e)} ET</Text>
            <Text style={s.meta} numberOfLines={1}>
              <Ionicons name="location-outline" />{" "}
              {e.location || "Location available at source"}
            </Text>
            <View
              style={[
                s.fit,
                {
                  backgroundColor:
                    fit.status === "free"
                      ? "#EDF5EE"
                      : fit.status === "conflict"
                        ? "#FFF0E2"
                        : "#F3F0ED",
                },
              ]}
            >
              <Ionicons
                name={
                  fit.status === "free"
                    ? "checkmark-circle-outline"
                    : fit.status === "conflict"
                      ? "alert-circle-outline"
                      : "help-circle-outline"
                }
                size={18}
                color={fit.status === "free" ? C.green : C.maroon}
              />
              <Text style={[s.small, { flex: 1 }]}>
                {fit.status === "free"
                  ? "Fits your availability"
                  : fit.status === "conflict"
                    ? "Schedule conflict"
                    : "Availability unknown"}
              </Text>
            </View>
            <Text style={[s.meta, { lineHeight: 21 }]} numberOfLines={2}>
              {reason}
            </Text>
          </View>
        </Pressable>
        <View
          style={[
            s.row,
            { justifyContent: "space-between", padding: 20, paddingTop: 14 },
          ]}
        >
          <Text style={s.small}>
            {mode === "demo"
              ? "SAMPLE EVENT"
              : e.sources[0].source === "gobblerconnect"
                ? "GobblerConnect"
                : "VT Sports"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              (saved.includes(e.id) ? "Unsave " : "Save ") + e.title
            }
            onPress={() => toggleSave(e)}
            style={s.saveButton}
          >
            <Ionicons
              name={saved.includes(e.id) ? "bookmark" : "bookmark-outline"}
              color={C.maroon}
              size={21}
            />
            <Text style={s.linkText}>
              {saved.includes(e.id) ? "Saved" : "Save"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
  const addBlock = () => {
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(blockStart) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(blockEnd) ||
      blockStart >= blockEnd
    ) {
      setError("Use HH:mm times with the end after the start.");
      return;
    }
    void saveProfile({
      ...profile,
      recurring: [
        ...profile.recurring,
        {
          id: Date.now().toString(),
          weekday,
          start: blockStart,
          end: blockEnd,
          kind: blockKind,
        },
      ],
    });
  };
  const busyBlock = () => {
    const start = DateTime.fromISO(busyDate + "T" + blockStart, {
        zone: CAMPUS_TZ,
      }),
      end = DateTime.fromISO(busyDate + "T" + blockEnd, { zone: CAMPUS_TZ });
    if (!start.isValid || !end.isValid || end <= start) {
      setError("Enter a valid date and time range.");
      return;
    }
    void saveProfile({
      ...profile,
      busy: [
        ...profile.busy,
        {
          id: Date.now().toString(),
          start: start.toUTC().toISO()!,
          end: end.toUTC().toISO()!,
          source: "manual",
        },
      ],
    });
  };
  const availabilityEditor = (
    <View style={s.panel}>
      <Text style={s.sectionTitle}>Make room for campus life</Text>
      <Text style={s.body}>
        Tell Gobbler when you’re available or busy. All times are Eastern. An
        empty schedule means unknown availability.
      </Text>
      <View style={s.wrap}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
          <Chip
            key={d}
            label={d}
            active={weekday === i + 1}
            onPress={() => setWeekday(i + 1)}
          />
        ))}
      </View>
      <View style={s.wrap}>
        <Chip
          label="Available"
          active={blockKind === "free"}
          onPress={() => setBlockKind("free")}
        />
        <Chip
          label="Busy"
          active={blockKind === "busy"}
          onPress={() => setBlockKind("busy")}
        />
      </View>
      <View style={s.wrap}>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Field
            label="From (HH:mm)"
            value={blockStart}
            onChange={setBlockStart}
          />
        </View>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Field
            label="Until (HH:mm)"
            value={blockEnd}
            onChange={setBlockEnd}
          />
        </View>
      </View>
      <Button label="Add recurring block" secondary onPress={addBlock} />
      {profile.recurring.map((b) => (
        <View key={b.id} style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={s.body}>
            {["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][b.weekday]} ·{" "}
            {b.start}–{b.end} · {b.kind === "free" ? "Available" : "Busy"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={"Remove " + b.weekday + " " + b.start}
            onPress={() =>
              saveProfile({
                ...profile,
                recurring: profile.recurring.filter((x) => x.id !== b.id),
              })
            }
          >
            <Ionicons name="close-circle-outline" size={24} color={C.maroon} />
          </Pressable>
        </View>
      ))}
      <View style={s.divider} />
      <Text style={s.label}>One-time busy block</Text>
      <Field
        label="Date (YYYY-MM-DD)"
        value={busyDate}
        onChange={setBusyDate}
      />
      <Text style={s.meta}>Uses the From and Until times above.</Text>
      <Button label="Add busy block" secondary onPress={busyBlock} />
      {profile.busy.map((b) => (
        <View style={[s.row, { justifyContent: "space-between" }]} key={b.id}>
          <Text style={s.meta}>
            {date(b.start)} – {date(b.end, "h:mm a")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove busy block"
            onPress={() =>
              saveProfile({
                ...profile,
                busy: profile.busy.filter((x) => x.id !== b.id),
              })
            }
          >
            <Ionicons name="close-circle-outline" size={24} color={C.maroon} />
          </Pressable>
        </View>
      ))}
    </View>
  );
  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="My Little Gobbler home"
            style={s.brand}
            onPress={() => go("landing")}
          >
            <Gobbler size={49} />
            <Text style={[s.brandText, mobile && { fontSize: 17 }]}>
              My Little Gobbler<Text style={{ color: C.orange }}>.</Text>
            </Text>
          </Pressable>
          {!mobile && page !== "landing" && page !== "auth" && (
            <View style={s.row}>
              {(["discover", "saved", "schedule", "gobbler"] as Page[]).map(
                (p) => (
                  <Pressable
                    accessibilityRole="button"
                    key={p}
                    onPress={() => go(p)}
                    style={[
                      s.navItem,
                      page === p && { borderBottomColor: C.maroon },
                    ]}
                  >
                    <Text
                      style={[
                        s.navText,
                        page === p && { color: C.maroon, fontWeight: "700" },
                      ]}
                    >
                      {p === "gobbler"
                        ? "Ask Gobbler"
                        : p[0].toUpperCase() + p.slice(1)}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              user || mode === "demo" ? "Settings" : "Sign in"
            }
            onPress={() => {
              if (!user && mode !== "demo") setSignUp(false);
              go(user || mode === "demo" ? "settings" : "auth");
            }}
            style={s.avatar}
          >
            <Ionicons
              name={
                user || mode === "demo" ? "settings-outline" : "person-outline"
              }
              size={22}
              color={C.maroon}
            />
          </Pressable>
        </View>
        {PREVIEW && (
          <View style={s.demoBanner}>
            <Text style={s.meta}>
              PREVIEW · Demo is ready. Public listings are dated snapshots;
              accounts and connected services await production setup.
            </Text>
          </View>
        )}
        {mode === "demo" && page !== "landing" && (
          <View style={s.demoBanner}>
            <Text style={[s.small, { flex: 1 }]}>
              DEMO MODE · Sample events and availability. Your accounts stay
              private.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMode("live");
                setProfile(emptyProfile);
                setSaved([]);
                setRankedLive(null);
                if (user)
                  void run(async () => {
                    await loadMe();
                    await loadEvents("live");
                  });
                go("discover");
              }}
            >
              <Text style={s.linkText}>View live events →</Text>
            </Pressable>
          </View>
        )}
        {mobile && page !== "landing" && page !== "auth" && (
          <View
            style={[
              s.wrap,
              {
                justifyContent: "space-around",
                padding: 12,
                backgroundColor: "white",
              },
            ]}
          >
            {(["discover", "saved", "schedule", "gobbler"] as Page[]).map(
              (p) => (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  onPress={() => go(p)}
                >
                  <Text
                    style={[
                      s.small,
                      {
                        color: page === p ? C.maroon : C.muted,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {p === "gobbler"
                      ? "Ask Gobbler"
                      : p[0].toUpperCase() + p.slice(1)}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
        )}
        <View style={[s.main, { paddingHorizontal: mobile ? 20 : 44 }]}>
          {!!error && (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={[s.body, { color: "#8C2525" }]}>{error}</Text>
              <Button secondary label="Dismiss" onPress={() => setError("")} />
            </View>
          )}
          {!!toast && (
            <View accessibilityLiveRegion="polite" style={s.toast}>
              <Text style={s.body}>{toast}</Text>
            </View>
          )}
          {loading && (
            <View style={s.row}>
              <ActivityIndicator color={C.maroon} />
              <Text style={s.meta}>Gobbler’s on it…</Text>
            </View>
          )}
          {page === "landing" && (
            <>
              <View
                style={[
                  s.hero,
                  mobile && { flexDirection: "column", paddingVertical: 28 },
                ]}
              >
                <View style={{ flex: 1, gap: 24 }}>
                  <View style={s.eyebrow}>
                    <Text style={s.eyebrowText}>
                      A LITTLE CURIOUS. A LOT TO DISCOVER.
                    </Text>
                  </View>
                  <Text
                    accessibilityRole="header"
                    style={[
                      s.heroTitle,
                      mobile && { fontSize: 44, lineHeight: 49 },
                    ]}
                  >
                    Find your people.{"\n"}Make your campus
                    <Text style={{ color: C.orange }}> yours.</Text>
                  </Text>
                  <Text
                    style={[
                      s.body,
                      { fontSize: 19, lineHeight: 29, maxWidth: 480 },
                    ]}
                  >
                    Meet My Little Gobbler. Your little guide to campus life,
                    with things you’ll love and time to actually do them.
                  </Text>
                  <View style={s.wrap}>
                    <Button
                      label="Take Gobbler for a spin"
                      icon="sparkles-outline"
                      onPress={enterDemo}
                    />
                    <Button
                      label="Create your account"
                      secondary
                      onPress={() => {
                        setMode("live");
                        setSignUp(true);
                        go("auth");
                      }}
                    />
                  </View>
                  <Text style={s.meta}>
                    No account needed for the demo. Just a little curiosity.
                  </Text>
                </View>
                <View
                  style={[
                    s.mascotHero,
                    mobile && { width: "100%", minHeight: 270 },
                  ]}
                >
                  <View style={s.mascotCircle}>
                    <Gobbler size={mobile ? 270 : 350} />
                  </View>
                  <View style={s.speech}>
                    <Text
                      style={{
                        fontSize: 17,
                        fontWeight: "700",
                        color: C.maroon,
                      }}
                    >
                      Hey, Hokie. Let’s get you out there.
                    </Text>
                  </View>
                </View>
              </View>
              <View style={[s.steps, mobile && { flexDirection: "column" }]}>
                {[
                  [
                    "01",
                    "A little about you",
                    "Pick your interests and tell us when you have time.",
                  ],
                  [
                    "02",
                    "A few good possibilities",
                    "Explore real campus listings with clear reasons they fit.",
                  ],
                  [
                    "03",
                    "Something to look forward to",
                    "Save a favorite or bring it along to your calendar.",
                  ],
                ].map(([n, title, copy]) => (
                  <View key={n} style={{ flex: 1, gap: 12 }}>
                    <Text style={s.stepNumber}>{n}</Text>
                    <Text style={s.sectionTitle}>{title}</Text>
                    <Text style={s.body}>{copy}</Text>
                  </View>
                ))}
              </View>
              <View
                style={[
                  s.row,
                  {
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    paddingVertical: 32,
                    gap: 16,
                  },
                ]}
              >
                <Text style={s.sectionTitle}>
                  Campus is happening. Find your part in it.
                </Text>
                <Button
                  label="Explore live events"
                  secondary
                  onPress={() => {
                    setMode("live");
                    go("discover");
                  }}
                />
              </View>
            </>
          )}
          {page === "auth" && (
            <View
              style={[
                s.panel,
                {
                  maxWidth: 520,
                  alignSelf: "center",
                  width: "100%",
                  marginVertical: 28,
                },
              ]}
            >
              <Gobbler size={90} />
              <Text accessibilityRole="header" style={s.pageTitle}>
                {signUp ? "A little more you." : "Welcome back, Hokie."}
              </Text>
              <Text style={s.body}>
                {signUp
                  ? "Create an account to keep your interests, saved events, and schedule together."
                  : "Sign in to pick up where you left off."}
              </Text>
              {signUp && (
                <Field label="Your name" value={name} onChange={setName} />
              )}
              <Field label="Email" value={email} onChange={setEmail} />
              <Field
                label="Password (at least 12 characters)"
                value={password}
                onChange={setPassword}
                secure
              />
              <Button
                label={signUp ? "Create account" : "Sign in"}
                disabled={loading}
                onPress={() =>
                  run(async () => {
                    await api(
                      signUp ? "/auth/sign-up/email" : "/auth/sign-in/email",
                      {
                        email,
                        password,
                        ...(signUp ? { name } : {}),
                        callbackURL: "/",
                      },
                    );
                    setPassword("");
                    setMode("live");
                    const me = await loadMe();
                    go(me.profile.onboarded ? "discover" : "onboarding");
                  })
                }
              />
              <Button
                secondary
                label={
                  signUp
                    ? "Already have an account? Sign in"
                    : "New here? Create an account"
                }
                onPress={() => setSignUp(!signUp)}
              />
              <Button
                secondary
                label="Try the demo instead"
                onPress={enterDemo}
              />
              {!health.accounts && (
                <Text style={s.meta}>
                  Account setup is awaiting the project database. The demo and
                  public listings are available.
                </Text>
              )}
            </View>
          )}
          {page === "onboarding" && (
            <View
              style={{
                gap: 24,
                maxWidth: 760,
                alignSelf: "center",
                width: "100%",
              }}
            >
              <Text style={s.eyebrowText}>LET’S GET TO KNOW YOU</Text>
              <Text accessibilityRole="header" style={s.pageTitle}>
                What makes you curious?
              </Text>
              <Text style={s.body}>
                Choose a few interests. You can change these any time.
              </Text>
              <View style={s.wrap}>
                {categories.map((c) => (
                  <Chip
                    label={c}
                    key={c}
                    active={profile.interests.includes(c)}
                    onPress={() =>
                      setProfile({
                        ...profile,
                        interests: profile.interests.includes(c)
                          ? profile.interests.filter((x) => x !== c)
                          : [...profile.interests, c],
                      })
                    }
                  />
                ))}
              </View>
              {availabilityEditor}
              <Button
                label="Find my campus moments"
                onPress={() =>
                  run(async () => {
                    const p = { ...profile, onboarded: true };
                    if (mode === "live") await api("/profile", p, "PUT");
                    setProfile(p);
                    go("discover");
                  })
                }
              />
            </View>
          )}
          {page === "discover" && !selected && (
            <>
              <View style={[s.welcome, mobile && { padding: 22 }]}>
                <View style={{ flex: 1, gap: 12 }}>
                  <Text style={s.eyebrowText}>
                    {mode === "demo"
                      ? "A LITTLE TASTE OF CAMPUS LIFE"
                      : "YOUR CAMPUS, YOUR KIND OF DAY"}
                  </Text>
                  <Text
                    accessibilityRole="header"
                    style={[s.pageTitle, mobile && { fontSize: 30 }]}
                  >
                    {profile.onboarded
                      ? `Hey, ${profile.name}. What’s your next little adventure?`
                      : "There’s a little something for everyone."}
                  </Text>
                  <Text style={s.body}>
                    Good company. New interests. A reason to close your laptop.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      go(user || mode === "demo" ? "onboarding" : "auth")
                    }
                  >
                    <Text style={s.linkText}>
                      {profile.onboarded
                        ? "Fine-tune your interests →"
                        : "Make it personal →"}
                    </Text>
                  </Pressable>
                </View>
                {!mobile && <Gobbler size={160} />}
              </View>
              <View
                style={[
                  s.row,
                  {
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 16,
                  },
                ]}
              >
                <View>
                  <Text style={s.sectionTitle}>Your next campus moment</Text>
                  <Text style={[s.meta, { marginTop: 7 }]}>
                    {mode === "demo"
                      ? "Sample picks for a full, account-free tour."
                      : "Real campus listings, with room to explore."}
                  </Text>
                </View>
                <Text style={s.meta}>
                  {filtered.length} {filtered.length === 1 ? "event" : "events"}{" "}
                  · Eastern time
                </Text>
              </View>
              <View style={[s.row, s.searchBar]}>
                <Ionicons name="search-outline" size={23} color={C.muted} />
                <TextInput
                  accessibilityLabel="Search campus events"
                  placeholder="Search events, interests, or places…"
                  placeholderTextColor={C.muted}
                  value={search}
                  onChangeText={setSearch}
                  style={{ flex: 1, fontSize: 16, color: C.ink, padding: 12 }}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 9 }}
              >
                {["All interests", ...categories].map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={category === c}
                    onPress={() => setCategory(c)}
                  />
                ))}
              </ScrollView>
              <View style={s.wrap}>
                {["Any day", "Today", "This week", "Weekend"].map((d) => (
                  <Chip
                    key={d}
                    label={d}
                    active={dateFilter === d}
                    onPress={() => setDateFilter(d)}
                  />
                ))}
              </View>
              {!filtered.length && !loading && (
                <View style={s.panel}>
                  <Text style={s.sectionTitle}>
                    {events.length
                      ? "No little adventures match these filters."
                      : "No current listings are available."}
                  </Text>
                  <Text style={s.body}>
                    {events.length
                      ? "Try another interest or a wider date range."
                      : "The campus feed may still be refreshing. We never replace missing live events with samples."}
                  </Text>
                  <Button
                    secondary
                    label="Refresh events"
                    onPress={() => run(() => loadEvents(mode))}
                  />
                </View>
              )}
              <View style={s.eventGrid}>
                {filtered.slice(0, 60).map((item: any) => (
                  <EventCard key={item.event.id} item={item} />
                ))}
              </View>
              {filtered.length > 60 && (
                <Text style={s.meta}>
                  Showing the first 60 matches. Use search or filters to narrow
                  your results.
                </Text>
              )}
            </>
          )}
          {selected && (
            <View
              style={{
                maxWidth: 850,
                width: "100%",
                alignSelf: "center",
                gap: 24,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelected(null);
                  setCalendar(false);
                }}
              >
                <Text style={s.linkText}>← Back to events</Text>
              </Pressable>
              <View style={s.panel}>
                <Text style={s.eyebrowText}>
                  {mode === "demo"
                    ? "SAMPLE EVENT"
                    : selected.sources[0].source.toUpperCase()}
                </Text>
                <Text accessibilityRole="header" style={s.pageTitle}>
                  {selected.title}
                </Text>
                <Text style={s.body}>
                  {eventTime(selected)}
                  {selected.end ? " – " + date(selected.end, "h:mm a") : ""} ET
                </Text>
                <Text style={s.body}>
                  {selected.location ||
                    "Location not published. Check the original source."}
                </Text>
                <Text style={s.meta}>
                  Hosted by{" "}
                  {selected.organizer ||
                    "an organizer not listed by the source"}
                </Text>
                <Text style={[s.body, { lineHeight: 28 }]}>
                  {selected.description}
                </Text>
                <View style={s.fit}>
                  <Text style={s.body}>
                    {ranked.find((x) => x.event.id === selected.id)?.reason ||
                      scheduleFit(selected, profile).reason}
                  </Text>
                </View>
                <Text style={s.meta}>
                  Source timezone: {selected.timezone} · Last checked{" "}
                  {date(selected.sources[0].fetchedAt)}
                </Text>
                {Date.now() - Date.parse(selected.sources[0].fetchedAt) >
                  86400000 && (
                  <Text style={{ color: C.orange }}>
                    This listing is stale. Confirm details at the source.
                  </Text>
                )}
                <View style={s.wrap}>
                  <Button
                    secondary
                    label={
                      saved.includes(selected.id)
                        ? "Unsave event"
                        : "Save event"
                    }
                    icon="bookmark-outline"
                    onPress={() => toggleSave(selected)}
                  />
                  <Button
                    label="Add to calendar"
                    icon="calendar-outline"
                    onPress={() => setCalendar(true)}
                  />
                  <Button
                    secondary
                    label="Original source ↗"
                    onPress={() => Linking.openURL(selected.sources[0].url)}
                  />
                </View>
                <View style={s.wrap}>
                  <Text style={s.meta}>Is this your kind of thing?</Text>
                  {[1, -1].map((value) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        value === 1 ? "More like this" : "Less like this"
                      }
                      key={value}
                      onPress={() =>
                        run(async () => {
                          if (mode === "live") {
                            if (!user)
                              throw new Error("Sign in to share feedback.");
                            await api("/feedback", {
                              eventId: selected.id,
                              value,
                            });
                          }
                          setFeedback({ ...feedback, [selected.id]: value });
                          notify("Thanks! Gobbler will use that feedback.");
                        })
                      }
                    >
                      <Ionicons
                        name={
                          value === 1
                            ? "thumbs-up-outline"
                            : "thumbs-down-outline"
                        }
                        size={24}
                        color={C.maroon}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
              {calendar && (
                <View style={s.panel}>
                  <Text style={s.sectionTitle}>
                    Bring this along to your calendar
                  </Text>
                  <Text style={s.body}>
                    {selected.title}
                    {"\n"}
                    {eventTime(selected)} ET{"\n"}
                    {selected.location || "Location to be confirmed"}
                  </Text>
                  <View style={s.wrap}>
                    <Chip
                      label="Download ICS"
                      active={destination === "ics"}
                      onPress={() => setDestination("ics")}
                    />
                    {mode === "live" &&
                      ["google", "canvas"].map((p) => (
                        <Chip
                          key={p}
                          label={
                            p === "google"
                              ? "Google · primary calendar"
                              : "Canvas · personal calendar"
                          }
                          active={destination === p}
                          onPress={() => setDestination(p)}
                        />
                      ))}
                  </View>
                  <Text style={s.meta}>
                    {destination === "ics"
                      ? "Destination: a calendar app of your choice. Download the file, then open it to import."
                      : `Destination: your connected ${destination === "google" ? "Google primary" : "Canvas personal"} calendar. This will create one event.`}
                  </Text>
                  <Button
                    disabled={loading}
                    label={
                      destination === "ics"
                        ? "Download calendar file"
                        : `Confirm: add to ${destination === "google" ? "Google" : "Canvas"}`
                    }
                    onPress={() =>
                      destination === "ics"
                        ? download(selected)
                        : run(async () => {
                            await api("/calendar", {
                              eventId: selected.id,
                              destination,
                              confirmed: true,
                            });
                            notify("Event added to your calendar.");
                            setCalendar(false);
                          })
                    }
                  />
                </View>
              )}
            </View>
          )}
          {page === "saved" && !selected && (
            <>
              <Text style={s.eyebrowText}>KEEP THE GOOD ONES CLOSE</Text>
              <Text accessibilityRole="header" style={s.pageTitle}>
                Your little list
              </Text>
              <Text style={s.body}>
                Things you’re looking forward to, all in one place.
              </Text>
              {!saved.length && (
                <View style={s.panel}>
                  <Gobbler size={110} />
                  <Text style={s.sectionTitle}>A little empty, for now.</Text>
                  <Text style={s.body}>
                    Tap Save on an event and it’ll be waiting here.
                  </Text>
                  <Button
                    label="Find something good"
                    onPress={() => go("discover")}
                  />
                </View>
              )}
              <View style={s.eventGrid}>
                {ranked
                  .filter((x) => saved.includes(x.event.id))
                  .map((item) => (
                    <EventCard key={item.event.id} item={item} />
                  ))}
              </View>
              {saved.some((id) => !events.some((e) => e.id === id)) && (
                <Text style={s.meta}>
                  Some saved events have ended or are no longer listed by the
                  source.
                </Text>
              )}
            </>
          )}
          {page === "schedule" && !selected && (
            <>
              <Text style={s.eyebrowText}>
                A LITTLE ROOM FOR SOMETHING GOOD
              </Text>
              <Text accessibilityRole="header" style={s.pageTitle}>
                Your week, with possibilities
              </Text>
              <Text style={s.body}>
                Saved events and availability, together. Calendar connections
                contribute busy time; they don’t automatically confirm your free
                time.
              </Text>
              <View style={[s.columns, mobile && { flexDirection: "column" }]}>
                <View style={{ flex: 1, gap: 16 }}>
                  {ranked
                    .filter((x) => saved.includes(x.event.id))
                    .sort((a, b) => a.event.start.localeCompare(b.event.start))
                    .map((item) => (
                      <EventCard key={item.event.id} item={item} compact />
                    ))}
                  {!saved.length && (
                    <View style={s.panel}>
                      <Text style={s.body}>
                        Save an event to see how it fits your week.
                      </Text>
                      <Button
                        secondary
                        label="Explore events"
                        onPress={() => go("discover")}
                      />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>{availabilityEditor}</View>
              </View>
            </>
          )}
          {page === "gobbler" && !selected && (
            <>
              <View
                style={{ alignItems: "center", gap: 14, paddingVertical: 20 }}
              >
                <Gobbler size={125} />
                <Text accessibilityRole="header" style={s.pageTitle}>
                  A little help from Gobbler.
                </Text>
                <Text style={[s.body, { textAlign: "center", maxWidth: 580 }]}>
                  Tell me what you have in mind. I’ll look through current
                  listings and check them against the availability you shared.
                </Text>
              </View>
              <View
                style={[
                  s.panel,
                  { maxWidth: 800, width: "100%", alignSelf: "center" },
                ]}
              >
                <Field
                  label="Ask Gobbler"
                  value={query}
                  onChange={setQuery}
                  placeholder="What can I do Friday after 5?"
                />
                <View style={s.wrap}>
                  {["Friday after 5", "Weekend outdoors", "Arts & music"].map(
                    (q) => (
                      <Chip label={q} key={q} onPress={() => setQuery(q)} />
                    ),
                  )}
                </View>
                <Button
                  label="Find my next little adventure"
                  disabled={loading || !query.trim()}
                  onPress={() =>
                    run(async () => {
                      if (mode === "live" && !user) {
                        go("auth");
                        return;
                      }
                      if (mode === "demo") {
                        const matches = recommendations(
                          filterQuestion(events, questionFilter(query)),
                          profile,
                          saved,
                          feedback,
                        ).slice(0, 8);
                        setAnswer({
                          answer: matches.length
                            ? `I found ${matches.length} sample options for you.`
                            : "No sample events match that request. Try another day or interest.",
                          notice:
                            "Demo Gobbler uses deterministic matching with sample events.",
                          recommendations: matches,
                        });
                      } else setAnswer(await api("/assistant", { query }));
                    })
                  }
                />
                <Text style={s.meta}>
                  {mode === "demo"
                    ? "Demo Gobbler uses sample events and deterministic matching."
                    : profile.aiEnabled
                      ? "Gemini can match your question to campus events. Schedule checks and explanations come from app records."
                      : "Gobbler uses deterministic matching. Enable Gemini in Settings to interpret more natural questions."}
                </Text>
              </View>
              {answer && (
                <>
                  <View style={s.panel}>
                    <Text style={s.sectionTitle}>{answer.answer}</Text>
                    <Text style={s.meta}>{answer.notice}</Text>
                    <GobblerVoice
                      key={mode + query}
                      ids={answer.recommendations.map(
                        (item: any) => item.event.id,
                      )}
                      enabled={mode === "live" && !!user && !!health.voice}
                    />
                  </View>
                  <View style={s.eventGrid}>
                    {answer.recommendations.map((item: any) => (
                      <EventCard key={item.event.id} item={item} />
                    ))}
                  </View>
                </>
              )}
            </>
          )}
          {page === "settings" && (
            <>
              <Text style={s.eyebrowText}>YOUR GOBBLER, YOUR WAY</Text>
              <Text accessibilityRole="header" style={s.pageTitle}>
                Preferences & connections
              </Text>
              <View style={[s.columns, mobile && { flexDirection: "column" }]}>
                <View style={{ flex: 1, gap: 24 }}>
                  <View style={s.panel}>
                    <Text style={s.sectionTitle}>A little about you</Text>
                    <Field
                      label="Preferred name"
                      value={profile.name}
                      onChange={(v) => setProfile({ ...profile, name: v })}
                    />
                    <View style={s.wrap}>
                      {categories.map((c) => (
                        <Chip
                          key={c}
                          label={c}
                          active={profile.interests.includes(c)}
                          onPress={() =>
                            setProfile({
                              ...profile,
                              interests: profile.interests.includes(c)
                                ? profile.interests.filter((x) => x !== c)
                                : [...profile.interests, c],
                            })
                          }
                        />
                      ))}
                    </View>
                    <Button
                      label="Save preferences"
                      onPress={() => saveProfile(profile)}
                    />
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: profile.aiEnabled }}
                      onPress={() =>
                        saveProfile({
                          ...profile,
                          aiEnabled: !profile.aiEnabled,
                        })
                      }
                      style={s.row}
                    >
                      <Ionicons
                        name={profile.aiEnabled ? "checkbox" : "square-outline"}
                        size={25}
                        color={C.maroon}
                      />
                      <Text style={[s.body, { flex: 1 }]}>
                        Use Gemini to match my interests and questions
                      </Text>
                    </Pressable>
                    <Text style={s.meta}>
                      When enabled, your typed question, selected interest
                      categories, and public event listings are sent to Google
                      Gemini. Don’t include private details. Calendar contents,
                      tokens, and Discord messages are never sent. Google’s free
                      tier may use prompts to improve its products.
                    </Text>
                  </View>
                  {availabilityEditor}
                </View>
                <View style={{ flex: 1, gap: 24 }}>
                  <View style={s.panel}>
                    <Text style={s.sectionTitle}>Your campus connections</Text>
                    <Text style={s.body}>
                      You’re always in control. Calendar writes require your
                      confirmation.
                    </Text>
                    {mode === "demo" ? (
                      <Text style={s.body}>
                        Connections are disabled in the public demo. Sign in to
                        connect your own accounts.
                      </Text>
                    ) : !user ? (
                      <Button
                        label="Sign in to connect"
                        onPress={() => go("auth")}
                      />
                    ) : (
                      connections.map((c) => (
                        <View
                          style={{
                            gap: 12,
                            paddingVertical: 14,
                            borderTopWidth: 1,
                            borderColor: C.line,
                          }}
                          key={c.provider}
                        >
                          <Text style={s.sectionTitle}>
                            {c.provider === "google"
                              ? "Google Calendar"
                              : c.provider === "canvas"
                                ? "Canvas"
                                : "Discord announcements"}
                          </Text>
                          <Text style={s.meta}>
                            {c.status ||
                              (c.configured
                                ? "Not connected"
                                : "Unavailable")}{" "}
                            {c.lastSync
                              ? `· Last synced ${date(c.lastSync)}`
                              : ""}
                          </Text>
                          {!c.configured && (
                            <Text style={s.body}>{c.blocker}</Text>
                          )}
                          <View style={s.wrap}>
                            <Button
                              secondary
                              disabled={!c.configured || loading}
                              label={c.status ? "Reconnect" : "Connect"}
                              onPress={() =>
                                run(async () => {
                                  const d = await api(
                                    "/connections/" + c.provider + "/connect",
                                    {},
                                  );
                                  await Linking.openURL(d.url);
                                })
                              }
                            />
                            {c.status && (
                              <>
                                <Button
                                  secondary
                                  label="Sync now"
                                  onPress={() =>
                                    run(async () => {
                                      await api(
                                        "/connections/" + c.provider + "/sync",
                                        {},
                                      );
                                      const d = await api("/connections");
                                      setConnections(d.connections);
                                      setPrivateContext(
                                        await api("/private-context"),
                                      );
                                      notify("Sync complete.");
                                    })
                                  }
                                />
                                <Button
                                  secondary
                                  label="Disconnect"
                                  onPress={() =>
                                    run(async () => {
                                      const d = await api(
                                        "/connections/" + c.provider,
                                        {},
                                        "DELETE",
                                      );
                                      setConnections(
                                        (await api("/connections")).connections,
                                      );
                                      setPrivateContext(
                                        await api("/private-context"),
                                      );
                                      notify(
                                        d.revoked
                                          ? "Disconnected and access revoked."
                                          : "Disconnected locally. You can also revoke access in the provider’s settings.",
                                      );
                                    })
                                  }
                                />
                              </>
                            )}
                          </View>
                          {c.provider === "discord" && c.status && (
                            <>
                              <Button
                                secondary
                                label="Choose authorized channels"
                                onPress={() =>
                                  run(async () =>
                                    setDiscordChannels(
                                      (await api("/discord/channels")).channels,
                                    ),
                                  )
                                }
                              />
                              <DiscordOwnerSettings />
                              {discordChannels.map((ch) => (
                                <Chip
                                  key={ch.id}
                                  label={"#" + ch.name}
                                  active={c.channels?.includes(ch.id)}
                                  onPress={() =>
                                    run(async () => {
                                      const selected = c.channels?.includes(
                                        ch.id,
                                      )
                                        ? c.channels.filter(
                                            (id: string) => id !== ch.id,
                                          )
                                        : [...(c.channels || []), ch.id];
                                      await api(
                                        "/discord/channels",
                                        { channels: selected },
                                        "PUT",
                                      );
                                      setConnections(
                                        (await api("/connections")).connections,
                                      );
                                    })
                                  }
                                />
                              ))}
                            </>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                  <View style={s.panel}>
                    <Text style={s.sectionTitle}>Campus listing status</Text>
                    {mode === "demo" ? (
                      <Text style={s.body}>
                        Sample data only. No private accounts are used.
                      </Text>
                    ) : (
                      Object.entries(sources).map(([key, value]: any) => (
                        <View key={key} style={{ gap: 6 }}>
                          <Text style={s.label}>
                            {key === "gobblerconnect"
                              ? "GobblerConnect"
                              : "VT Sports"}{" "}
                            · {value.status}
                          </Text>
                          <Text style={s.meta}>
                            {value.lastSync
                              ? "Last checked " + date(value.lastSync)
                              : value.error || "Awaiting first refresh"}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                  {privateContext.map((ctx) => (
                    <View style={s.panel} key={ctx.provider}>
                      <Text style={s.sectionTitle}>
                        Private {ctx.provider} updates
                      </Text>
                      <Text style={s.meta}>
                        Visible only to your account. Synced{" "}
                        {date(ctx.syncedAt)}
                      </Text>
                      {ctx.courses?.map((c: any) => (
                        <Text key={c.id} style={s.body}>
                          {c.name}
                        </Text>
                      ))}
                      {ctx.announcements?.slice(0, 15).map((a: any) => (
                        <Pressable
                          key={a.id}
                          accessibilityRole="link"
                          onPress={() => Linking.openURL(a.url)}
                        >
                          <Text style={s.linkText}>{a.title || a.text}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                  <View style={s.panel}>
                    <Text style={s.sectionTitle}>Your data, your choice</Text>
                    <Text style={s.body}>
                      {mode === "demo"
                        ? "Demo preferences and saves stay in this browser."
                        : "Delete your profile, saved events, connections, and private schedule from My Little Gobbler. Events already added to external calendars remain there."}
                    </Text>
                    {mode === "demo" ? (
                      <Button
                        secondary
                        label="Reset demo data"
                        onPress={() => {
                          localStorage.removeItem("gobbler-demo-profile");
                          localStorage.removeItem("gobbler-demo-saved");
                          setProfile(demoProfile);
                          setSaved([]);
                          notify("Demo reset.");
                        }}
                      />
                    ) : (
                      user && (
                        <>
                          <Button
                            secondary
                            label="Sign out"
                            onPress={() =>
                              run(async () => {
                                await api("/auth/sign-out", {});
                                setUser(null);
                                setProfile(emptyProfile);
                                setSaved([]);
                                go("landing");
                              })
                            }
                          />
                          <Field
                            label="Type DELETE to permanently delete your account"
                            value={deleteText}
                            onChange={setDeleteText}
                          />
                          <Button
                            disabled={deleteText !== "DELETE" || loading}
                            secondary
                            label="Permanently delete my account"
                            onPress={() =>
                              run(async () => {
                                await api(
                                  "/account",
                                  { confirmation: "DELETE" },
                                  "DELETE",
                                );
                                setUser(null);
                                setProfile(emptyProfile);
                                setSaved([]);
                                go("landing");
                                notify("Your account data was deleted.");
                              })
                            }
                          />
                        </>
                      )
                    )}
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
        <View style={s.footer}>
          <Text style={[s.brandText, { fontSize: 17 }]}>
            My Little Gobbler.
          </Text>
          <Text style={[s.meta, { textAlign: "center" }]}>
            Your little guide to campus life.
          </Text>
          <Text style={[s.small, { textAlign: "center" }]}>
            Student-built with a little Hokie spirit. Not affiliated with or
            endorsed by Virginia Tech.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
function brFallback() {
  return null;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  header: {
    minHeight: 88,
    paddingHorizontal: 28,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: {
    fontSize: 22,
    fontWeight: "800",
    color: C.maroon,
    letterSpacing: -0.7,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  navItem: {
    paddingVertical: 28,
    paddingHorizontal: 12,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  navText: { fontSize: 15, color: C.muted },
  main: {
    width: "100%",
    maxWidth: 1240,
    alignSelf: "center",
    paddingVertical: 32,
    gap: 24,
    flex: 1,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 25,
    paddingVertical: 64,
  },
  heroTitle: {
    fontSize: 61,
    lineHeight: 66,
    fontWeight: "800",
    color: C.maroon,
    letterSpacing: -2.4,
  },
  eyebrow: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#F3E8D7",
  },
  eyebrowText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: C.maroon,
  },
  body: { fontSize: 16, lineHeight: 25, color: C.ink },
  meta: { fontSize: 14, lineHeight: 21, color: C.muted },
  small: { fontSize: 12, lineHeight: 18, color: C.muted },
  label: { fontSize: 14, fontWeight: "700", color: C.ink },
  pageTitle: {
    fontSize: 37,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -1.1,
    color: C.maroon,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: C.ink,
  },
  eventTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: C.ink,
  },
  button: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: C.maroon,
    paddingHorizontal: 20,
    paddingVertical: 13,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonSecondary: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#D7C6C9",
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: "white" },
  input: {
    borderWidth: 1,
    borderColor: "#DCCFD0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: C.ink,
    backgroundColor: "white",
    minHeight: 48,
  },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "white",
  },
  activeChip: { backgroundColor: C.maroon, borderColor: C.maroon },
  chipText: { fontSize: 14, fontWeight: "500", color: C.ink },
  linkText: { fontSize: 14, fontWeight: "700", color: C.maroon },
  panel: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 24,
    gap: 18,
  },
  mascotHero: {
    width: "45%",
    minHeight: 390,
    alignItems: "center",
    justifyContent: "center",
  },
  mascotCircle: {
    borderRadius: 200,
    backgroundColor: "#FBE6C4",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  speech: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginTop: -12,
    transform: [{ rotate: "-3deg" }],
  },
  steps: {
    flexDirection: "row",
    gap: 40,
    paddingVertical: 38,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: C.orange,
    letterSpacing: 2,
  },
  welcome: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.cream,
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F0E6D7",
    gap: 20,
  },
  searchBar: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    backgroundColor: "white",
    paddingLeft: 18,
  },
  eventGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 24,
    alignItems: "stretch",
  },
  eventCard: {
    width: "100%",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    backgroundColor: "white",
    overflow: "hidden",
  },
  eventTop: {
    height: 143,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateStamp: {
    backgroundColor: "white",
    borderRadius: 10,
    width: 59,
    paddingVertical: 8,
    alignItems: "center",
  },
  dateMonth: {
    fontSize: 12,
    fontWeight: "700",
    color: C.maroon,
    letterSpacing: 1,
  },
  dateDay: { fontSize: 27, lineHeight: 32, fontWeight: "700", color: C.maroon },
  categoryTag: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFFBB",
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  fit: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    backgroundColor: C.cream,
    padding: 10,
    borderRadius: 8,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    padding: 6,
  },
  columns: { flexDirection: "row", gap: 28, alignItems: "flex-start" },
  divider: { height: 1, backgroundColor: C.line },
  demoBanner: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: "#F7EDD5",
  },
  error: { backgroundColor: "#FFF0F0", borderRadius: 12, padding: 18, gap: 10 },
  toast: { backgroundColor: "#EBF4EB", padding: 14, borderRadius: 10 },
  footer: {
    alignItems: "center",
    gap: 9,
    borderTopWidth: 1,
    borderColor: C.line,
    padding: 28,
    backgroundColor: "white",
  },
});
