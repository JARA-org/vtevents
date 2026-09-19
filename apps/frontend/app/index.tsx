import React, { useEffect, useState, useRef } from "react";
import { Link } from "expo-router";
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
  Share,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  CampusEvent,
  Profile,
  Category,
  DiscoveryView,
  Recommendation,
  ConnectionView,
  PrivateContextView,
  AssistantReply,
  UserSummary,
  SourceHealth,
  HealthView,
} from "@gobbler/shared";
import { backend } from "../services/backend";
// Blank UI form state only; domain defaults are returned by bootstrap.
const blankProfile: Profile = {
  name: "",
  interests: [],
  recurring: [],
  busy: [],
  onboarded: false,
  aiEnabled: false,
};
const CAMPUS_TZ = "America/New_York"; // presentation formatting only
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

function GobblerVoice({ ids, enabled }: { ids: string[]; enabled: boolean }) {
  const [audioUrl, setAudioUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const selection = ids.join("|");
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
            const audio = await backend.narrate({ eventIds: ids });
            setAudioUrl(
              URL.createObjectURL(
                new Blob([audio.bytes], { type: audio.contentType }),
              ),
            );
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
          : "ElevenLabs narration is available for signed-in students when the voice service is connected."}
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
  icon?: React.ComponentProps<typeof Ionicons>["name"];
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
    [user, setUser] = useState<UserSummary | null>(null),
    [profile, setProfile] = useState<Profile>(blankProfile),
    [emptyProfile, setEmptyProfile] = useState<Profile>(blankProfile),
    [categories, setCategories] = useState<Category[]>([]),
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
    [connections, setConnections] = useState<ConnectionView[]>([]),
    [sources, setSources] = useState<Record<string, SourceHealth>>({}),
    [health, setHealth] = useState<Partial<HealthView>>({}),
    [query, setQuery] = useState(""),
    [answer, setAnswer] = useState<AssistantReply | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signUp, setSignUp] = useState(false),
    [name, setName] = useState(""),
    [weekday, setWeekday] = useState(1),
    [blockStart, setBlockStart] = useState("17:00"),
    [blockEnd, setBlockEnd] = useState("22:00"),
    [blockKind, setBlockKind] = useState<"free" | "busy">("free"),
    [busyDate, setBusyDate] = useState(
      DateTime.now().setZone(CAMPUS_TZ).toISODate()!,
    ),
    [deleteText, setDeleteText] = useState(""),
    [privateContext, setPrivateContext] = useState<PrivateContextView[]>([]),
    [discovery, setDiscovery] = useState<DiscoveryView>({
      recommendations: [],
      filtered: [],
      savedRecommendations: [],
      schedule: [],
    });
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
  useEffect(() => {
    if (!user && page !== "landing" && page !== "auth") setPage("auth");
  }, [user, page]);
  const loadEvents = async () => {
    const data = await backend.listEvents({ mode: "live" });
    setEvents(data.events);
    setSources(data.sources);
  };
  const loadMe = async () => {
    const me = await backend.getAccount(undefined);
    setUser(me.user);
    setProfile(me.profile);
    setSaved(me.saved);
    setFeedback(me.feedback);
    return me;
  };
  useEffect(() => {
    backend
      .bootstrap(undefined)
      .then((data) => {
        setEmptyProfile(data.emptyProfile);
        setCategories(data.categories);
      })
      .catch(() =>
        setError(
          "The backend is unavailable. Start the backend to use this app.",
        ),
      );
    backend
      .health(undefined)
      .then(setHealth)
      .catch(() => {});
    backend
      .getAccount(undefined)
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
    if (user && page !== "landing" && page !== "auth")
      void run(() => loadEvents());
  }, [user, page === "landing", page === "auth"]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setDiscovery({
      recommendations: [],
      filtered: [],
      savedRecommendations: [],
      schedule: [],
    });
    const timer = setTimeout(() => {
      backend
        .discover({
          search,
          category: category as Category | "All interests",
          dateFilter: dateFilter as
            "Any day" | "Today" | "This week" | "Weekend",
        })
        .then((view) => {
          if (active) setDiscovery(view);
        })
        .catch((e: Error) => {
          if (active) {
            setDiscovery({
              recommendations: [],
              filtered: [],
              savedRecommendations: [],
              schedule: [],
            });
            setError(e.message);
          }
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    page,
    profile,
    saved,
    feedback,
    user,
    events,
    search,
    category,
    dateFilter,
  ]);
  useEffect(() => {
    if (page === "settings" && user) {
      void run(async () => {
        const d = await backend.listConnections(undefined);
        setConnections(d.connections);
        setSources(d.sources);
        setPrivateContext(await backend.getPrivateContext(undefined));
      });
    }
  }, [page]);
  const ranked = discovery.recommendations;
  const filtered = discovery.filtered;
  useEffect(() => {
    if (user && page === "discover")
      for (const item of filtered.slice(0, 10)) {
        if (!impressions.current.has(item.event.id)) {
          impressions.current.add(item.event.id);
          backend
            .track({
              kind: "recommendation_impression",
              eventId: item.event.id,
            })
            .catch(() => {});
        }
      }
  }, [filtered, page, user]);
  const saveProfile = (p: Profile) =>
    run(async () => {
      {
        if (!user) throw new Error("Sign in to save your preferences.");
        p = await backend.updateProfile(p);
      }
      setProfile(p);
      notify("Preferences saved.");
    });
  const toggleSave = (e: CampusEvent) =>
    run(async () => {
      const next = !saved.includes(e.id);
      {
        if (!user) {
          go("auth");
          return;
        }
        const result = await backend.setSaved({ eventId: e.id, saved: next });
        setSaved(
          result.saved ? [...saved, e.id] : saved.filter((x) => x !== e.id),
        );
      }
      notify(
        next ? "Saved to your little list." : "Removed from saved events.",
      );
    });
  const viewEvent = (e: CampusEvent) => {
    setSelected(e);
    setCalendar(false);
    if (user)
      backend.track({ kind: "event_view", eventId: e.id }).catch(() => {});
  };
  const download = (e: CampusEvent) =>
    run(async () => {
      const calendarText = await backend.exportCalendar({
        eventId: e.id,
      });
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([calendarText], { type: "text/calendar;charset=utf-8" }),
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
      } else await Share.share({ message: calendarText, title: e.title });
    });
  function EventCard({
    item,
    compact = false,
  }: {
    item: Recommendation;
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
            {e.sources[0].source === "gobblerconnect"
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
    void run(async () => {
      const draft = await backend.previewAvailability({
        profile,
        block: {
          kind: "recurring",
          weekday,
          start: blockStart,
          end: blockEnd,
          availability: blockKind,
        },
      });
      await saveProfile(draft);
    });
  };
  const busyBlock = () => {
    void run(async () => {
      const draft = await backend.previewAvailability({
        profile,
        block: {
          kind: "dated",
          date: busyDate,
          start: blockStart,
          end: blockEnd,
        },
      });
      await saveProfile(draft);
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
          <Link href="/clubs" style={{ color: C.maroon, padding: 10 }}>
            Clubs
          </Link>
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
            accessibilityLabel={user ? "Settings" : "Sign in"}
            onPress={() => {
              if (!user) setSignUp(false);
              go(user ? "settings" : "auth");
            }}
            style={s.avatar}
          >
            <Ionicons
              name={user ? "settings-outline" : "person-outline"}
              size={22}
              color={C.maroon}
            />
          </Pressable>
        </View>

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
                      label="Sign in"
                      icon="sparkles-outline"
                      onPress={() => {
                        setSignUp(false);
                        go("auth");
                      }}
                    />
                    <Button
                      label="Create your account"
                      secondary
                      onPress={() => {
                        setSignUp(true);
                        go("auth");
                      }}
                    />
                  </View>
                  <Text style={s.meta}>
                    Sign in to discover events, save favorites, and connect your
                    calendar.
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
                  label="Sign in to explore events"
                  secondary
                  onPress={() => {
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
                    await (signUp ? backend.signUp : backend.signIn)({
                      email,
                      password,
                      name,
                      callbackURL: "/",
                    });
                    setPassword("");
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
              {!health.accounts && (
                <Text style={s.meta}>
                  Sign-in is temporarily unavailable. Please try again later.
                </Text>
              )}
            </View>
          )}
          {user && page === "onboarding" && (
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
                    let p = { ...profile, onboarded: true };
                    p = await backend.updateProfile(p);
                    setProfile(p);
                    go("discover");
                  })
                }
              />
            </View>
          )}
          {user && page === "discover" && !selected && (
            <>
              <View style={[s.welcome, mobile && { padding: 22 }]}>
                <View style={{ flex: 1, gap: 12 }}>
                  <Text style={s.eyebrowText}>
                    {"YOUR CAMPUS, YOUR KIND OF DAY"}
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
                    onPress={() => go(user ? "onboarding" : "auth")}
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
                    {"Real campus listings, with room to explore."}
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
                    onPress={() => run(() => loadEvents())}
                  />
                </View>
              )}
              <View style={s.eventGrid}>
                {filtered.slice(0, 60).map((item) => (
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
                  {selected.sources[0].source.toUpperCase()}
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
                    (selected.isOnline || selected.onlineUrl
                      ? "Online event"
                      : "Location not published. Check the original source.")}
                </Text>
                {selected.onlineUrl && (
                  <Button
                    label="Join online"
                    secondary
                    onPress={() => Linking.openURL(selected.onlineUrl!)}
                  />
                )}
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
                      "Schedule information is unavailable. Please refresh."}
                  </Text>
                </View>
                <Text style={s.meta}>
                  Source timezone: {selected.timezone} · Last checked{" "}
                  {date(selected.sources[0].fetchedAt)}
                </Text>
                {selected.stale && (
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
                          {
                            if (!user)
                              throw new Error("Sign in to share feedback.");
                            await backend.submitFeedback({
                              eventId: selected.id,
                              value: value as -1 | 1,
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
                    {["google", "canvas"].map((p) => (
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
                            await backend.addCalendar({
                              eventId: selected.id,
                              destination: destination as "google" | "canvas",
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
          {user && page === "saved" && !selected && (
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
                {discovery.savedRecommendations.map((item) => (
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
          {user && page === "schedule" && !selected && (
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
                  {discovery.schedule.map((item) => (
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
          {user && page === "gobbler" && !selected && (
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
                      if (!user) {
                        go("auth");
                        return;
                      }
                      setAnswer(await backend.askAssistant({ query }));
                    })
                  }
                />
                <Text style={s.meta}>
                  {profile.aiEnabled
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
                      key={query}
                      ids={answer.recommendations.map((item) => item.event.id)}
                      enabled={!!user && !!health.voice}
                    />
                  </View>
                  <View style={s.eventGrid}>
                    {answer.recommendations.map((item) => (
                      <EventCard key={item.event.id} item={item} />
                    ))}
                  </View>
                </>
              )}
            </>
          )}
          {user && page === "settings" && (
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
                      tokens, and private source text are never sent. Google’s
                      free tier may use prompts to improve its products.
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
                    {!user ? (
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
                                  const d = await backend.connect({
                                    provider: c.provider,
                                  });
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
                                      await backend.syncConnection({
                                        provider: c.provider,
                                      });
                                      const d =
                                        await backend.listConnections(
                                          undefined,
                                        );
                                      setConnections(d.connections);
                                      setPrivateContext(
                                        await backend.getPrivateContext(
                                          undefined,
                                        ),
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
                                      const d = await backend.disconnect({
                                        provider: c.provider,
                                      });
                                      setConnections(
                                        (
                                          await backend.listConnections(
                                            undefined,
                                          )
                                        ).connections,
                                      );
                                      setPrivateContext(
                                        await backend.getPrivateContext(
                                          undefined,
                                        ),
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
                        </View>
                      ))
                    )}
                  </View>
                  <View style={s.panel}>
                    <Text style={s.sectionTitle}>Discord server bot</Text>
                    <Text style={s.body}>
                      No Discord account linking is needed. A server admin
                      installs Gobbler and selects channels for public reading
                      with /gobbler watch public:true. Use [no-ai] in messages
                      to exclude them. Individual messages can also be submitted
                      from unwatched channels using Submit to Gobbler (public).
                      Discord channel settings are never changed. Event
                      collection is not enabled yet.
                    </Text>
                  </View>
                  <View style={s.panel}>
                    <Text style={s.sectionTitle}>Campus listing status</Text>
                    {Object.entries(sources).map(([key, value]) => (
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
                    ))}
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
                      {ctx.courses?.map((c) => (
                        <Text key={c.id} style={s.body}>
                          {c.name}
                        </Text>
                      ))}
                      {ctx.announcements?.slice(0, 15).map((a) => (
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
                      {
                        "Delete your profile, saved events, connections, and private schedule from My Little Gobbler. Events already added to external calendars remain there."
                      }
                    </Text>
                    {user && (
                      <>
                        <Button
                          secondary
                          label="Sign out"
                          onPress={() =>
                            run(async () => {
                              await backend.signOut({});
                              setUser(null);
                              setSelected(null);
                              setEvents([]);
                              setConnections([]);
                              setPrivateContext([]);
                              setFeedback({});
                              setAnswer(null);
                              setDiscovery({
                                recommendations: [],
                                filtered: [],
                                savedRecommendations: [],
                                schedule: [],
                              });
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
                              await backend.deleteAccount({
                                confirmation: "DELETE",
                              });
                              setUser(null);
                              setSelected(null);
                              setEvents([]);
                              setConnections([]);
                              setPrivateContext([]);
                              setFeedback({});
                              setAnswer(null);
                              setDiscovery({
                                recommendations: [],
                                filtered: [],
                                savedRecommendations: [],
                                schedule: [],
                              });
                              setProfile(emptyProfile);
                              setSaved([]);
                              go("landing");
                              notify("Your account data was deleted.");
                            })
                          }
                        />
                      </>
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
