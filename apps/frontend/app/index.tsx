import React, { useEffect, useState, useRef } from "react";
import { router } from "expo-router";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Linking,
  Share,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  CampusEvent,
  CampusDeadline,
  Profile,
  Category,
  DiscoveryView,
  Recommendation,
  AssistantReply,
  UserSummary,
  SourceHealth,
  HealthView,
} from "@gobbler/shared";
import { backend } from "../services/backend";
import { C, font } from "../components/theme";
import { Button, Chip, Field, Gobbler, Pressable } from "../components/ui";
import { useError } from "../components/ErrorModal";
import { SignInCard } from "../components/SignInCard";
import { Landing } from "../components/Landing";
import { ClubGuide } from "../components/ClubGuide";
import { TimelineExperience } from "../components/TimelineExperience";
import { EventCover } from "../components/EventCover";
import { sourceStatusText, sourceLabel } from "../components/source-status";
import { deadlineText } from "../components/event-presentation";
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
type Page =
  | "landing"
  | "timeline"
  | "discover"
  | "saved"
  | "schedule"
  | "gobbler"
  | "settings"
  | "onboarding"
  | "auth"
  | "club-setup";
const eventTime = (e: CampusEvent) =>
  e.timeTBD
    ? date(e.start, "ccc, LLL d") + " · Time TBD"
    : e.allDay
      ? date(e.start, "ccc, LLL d") + " · All day"
      : date(e.start);
const date = (s: string, fmt = "ccc, LLL d · h:mm a") =>
  DateTime.fromISO(s).setZone(CAMPUS_TZ).toFormat(fmt);

function GobblerVoice({ ids, enabled }: { ids: string[]; enabled: boolean }) {
  const reportError = useError();
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
        label="Listen to Gobbler"
        icon="volume-high-outline"
        secondary
        disabled={!enabled || busy || !!audioUrl}
        loading={busy}
        onPress={async () => {
          reportError("");
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
            reportError(
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
export default function Home() {
  const setError = useError();
  const { width } = useWindowDimensions(),
    mobile = width < 800;
  const impressions = useRef(new Set<string>());
  const scroll = useRef<ScrollView>(null);
  const requestedPage =
    Platform.OS === "web"
      ? new URLSearchParams(location.search).get("page")
      : null;
  const [page, setPage] = useState<Page>(
      requestedPage === "auth" || requestedPage === "club-setup"
        ? requestedPage
        : "landing",
    ),
    [user, setUser] = useState<UserSummary | null>(null),
    [profile, setProfile] = useState<Profile>(blankProfile),
    [emptyProfile, setEmptyProfile] = useState<Profile>(blankProfile),
    [categories, setCategories] = useState<Category[]>([]),
    [refreshVersion, setRefreshVersion] = useState(0),
    [discoveryLoading, setDiscoveryLoading] = useState(false),
    [saved, setSaved] = useState<string[]>([]),
    [feedback, setFeedback] = useState<Record<string, number>>({}),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All interests"),
    [dateFilter, setDateFilter] = useState("Any day"),
    [selected, setSelected] = useState<CampusEvent | null>(null),
    [selectedReason, setSelectedReason] = useState(""),
    [calendar, setCalendar] = useState(false),
    [loading, setLoading] = useState(false),
    [toast, setToast] = useState(""),
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
    [deadlines, setDeadlines] = useState<CampusDeadline[]>([]),
    [deadlineStatus, setDeadlineStatus] = useState("Loading deadlines…"),
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
      document.title = "My Gobbler";
    }
  };
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [page, selected]);
  useEffect(() => {
    // The club guide is public: a representative reads it before they have an
    // account, so it must not bounce to sign-in.
    if (!user && !["landing", "auth", "club-setup"].includes(page))
      setPage("auth");
  }, [user, page]);
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
          "We can’t reach My Gobbler right now. Check your connection and try again.",
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
          requestedPage === "landing" ||
            requestedPage === "auth" ||
            requestedPage === "club-setup"
            ? requestedPage
            : me.profile.onboarded
              ? Platform.OS === "web" &&
                new URLSearchParams(location.search).get("page") === "settings"
                ? "settings"
                : "timeline"
              : "onboarding",
        );
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!user) { setDeadlines([]); return; }
    if (page !== "discover") return;
    let active = true;
    setDeadlineStatus("Loading deadlines…");
    backend.listDeadlines(undefined).then(data => {
      if (active) {
        setDeadlines(data.deadlines);
        setDeadlineStatus(data.deadlines.length ? "" : "No deadlines are currently listed.");
      }
    }).catch(() => {
      if (active) { setDeadlines([]); setDeadlineStatus("Deadlines are unavailable. Please try again later."); }
    });
    return () => { active = false; };
  }, [user, page, refreshVersion]);
  useEffect(() => {
    if (!user || !["discover", "saved", "schedule"].includes(page)) {
      setDiscoveryLoading(false);
      return;
    }
    let active = true;
    setDiscoveryLoading(true);
    setDiscovery({
      recommendations: [],
      filtered: [],
      savedRecommendations: [],
      schedule: [],
    });
    const timer = setTimeout(() => {
      backend
        .discover({
          limit: 60,
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
        })
        .finally(() => { if (active) setDiscoveryLoading(false); });
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
    refreshVersion,
    search,
    category,
    dateFilter,
  ]);
  useEffect(() => {
    if (page === "settings" && user) {
      void run(async () => {
        const d = await backend.health(undefined);
        setSources(d.sources);
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
        next ? "Added to your saved plans." : "Removed from saved events.",
      );
    });
  const viewEvent = (e: CampusEvent, reason = "") => {
    setSelectedReason(reason);
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
        a.download = `my-gobbler-${e.id}.ics`;
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
      <View
        testID="event-card"
        style={[s.eventCard, !mobile && !compact && { width: "48%" }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={"View " + e.title}
          onPress={() => viewEvent(e)}
          style={{ gap: 16 }}
        >
          <View style={[s.eventTop, { backgroundColor: accent }]}>
            <EventCover event={e} />
            <View style={[s.dateStamp, { position: "absolute", top: 12, left: 12, zIndex: 1 }]}>
              <Text style={s.dateMonth}>
                {date(e.start, "LLL").toUpperCase()}
              </Text>
              <Text style={s.dateDay}>{date(e.start, "d")}</Text>
            </View>
            <View style={[s.categoryTag, { position: "absolute", bottom: 12, right: 12, backgroundColor: "white" }]}>
              <Text style={s.small}>{e.categories[0] || "Campus life"}</Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 20, gap: 9 }}>
            <Text style={s.eventTitle}>{e.title}</Text>
            {e.sports && <Text style={s.meta}>{e.sports.sport}{e.sports.opponent ? ` · ${e.sports.opponent}` : ""}</Text>}
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
            {e.sources[0]?.label || e.sources[0]?.source || "Campus listing"}
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
    <View testID={page === "timeline" && !selected ? "timeline-home" : undefined} style={s.root}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
      >
        <View testID="app-header" style={[s.header, { paddingHorizontal: mobile ? 24 : 56 }]}>
          <View style={[s.brandGroup, mobile && { gap: 10 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="My Gobbler home"
              style={[s.brand, mobile && { flexShrink: 1 }]}
              onPress={() => go("landing")}
            >
              <Gobbler head size={mobile ? 38 : 46} decorative />
              <Text
                numberOfLines={1}
                style={[
                  s.brandText,
                  mobile && { fontFamily: font, fontSize: 17, flexShrink: 1 },
                ]}
              >
                My Gobbler
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Discord setup guide for clubs"
              style={[s.bannerLink, mobile && { paddingHorizontal: 10 }]}
              onPress={() => go("club-setup")}
            >
              <Ionicons
                accessible={false}
                name="logo-discord"
                size={mobile ? 18 : 16}
                color={C.maroon}
              />
              {/* The label is dropped on a phone so the wordmark still fits;
                  the control keeps its accessible name either way. */}
              {!mobile && (
                <Text numberOfLines={1} style={s.bannerLinkText}>
                  For clubs
                </Text>
              )}
            </Pressable>
          </View>
          {!mobile && !!user && page !== "landing" && page !== "auth" && (
            <View style={s.row}>
              {(["timeline", "discover", "saved", "schedule", "gobbler"] as Page[]).map(
                (p) => (
                  <Pressable
                    accessibilityRole="button"
                    key={p}
                    testID="app-nav-item"
                    onPress={() => go(p)}
                    style={[
                      s.navItem,
                      page === p && {
                        borderBottomColor: C.maroon,
                        backgroundColor: C.pink,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.navText,
                        page === p && { color: C.maroon, fontWeight: "700" },
                      ]}
                    >
                      {p === "timeline" ? "For you" : p === "gobbler"
                        ? "Ask Gobbler"
                        : p[0].toUpperCase() + p.slice(1)}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          )}
          {user ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => go("settings")}
              style={s.avatar}
            >
              <Ionicons
                accessible={false}
                name="settings-outline"
                size={22}
                color={C.maroon}
              />
            </Pressable>
          ) : (
            <Button
              secondary
              label="Sign in"
              onPress={() => {
                setSignUp(false);
                go("auth");
              }}
            />
          )}
        </View>

        {mobile && !!user && page !== "landing" && page !== "auth" && (
          <View testID="mobile-nav"
            style={[
              s.wrap,
              {
                justifyContent: "space-around",
                padding: 12,
                backgroundColor: "white",
              },
            ]}
          >
            {(["timeline", "discover", "saved", "schedule", "gobbler"] as Page[]).map(
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
                    {p === "timeline" ? "For you" : p === "gobbler"
                      ? "Gobbler"
                      : p[0].toUpperCase() + p.slice(1)}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
        )}
        <View style={[s.main, { paddingHorizontal: mobile ? 24 : 56 }, page === "discover" && !selected && { gap: 14, paddingVertical: 24 }, page === "timeline" && !selected && { paddingHorizontal: mobile ? 12 : 24, paddingVertical: 0, maxWidth: 1600 }]}>
          {!!toast && (
            <View accessibilityLiveRegion="polite" style={s.toast}>
              <Text style={s.body}>{toast}</Text>
            </View>
          )}
          {(loading || discoveryLoading) && (
            <View style={s.row}>
              <ActivityIndicator color={C.maroon} />
              <Text style={s.meta}>Gobbler’s on it…</Text>
            </View>
          )}
          {page === "landing" && (
            <Landing
              signedIn={!!user}
              onStart={() => {
                if (user) go("timeline");
                else {
                  setSignUp(true);
                  go("auth");
                }
              }}
              onSignIn={() => {
                setSignUp(false);
                go("auth");
              }}
            />
          )}
          {page === "club-setup" && (
            <ClubGuide
              onBack={() => go("landing")}
              onWorkspace={() => router.push("/clubs")}
            />
          )}
          {page === "auth" && (
            <SignInCard
              signUp={signUp}
              name={name}
              email={email}
              password={password}
              loading={loading}
              setName={setName}
              setEmail={setEmail}
              setPassword={setPassword}
              onToggle={() => {
                setSignUp(!signUp);
                setPassword("");
              }}
              onSubmit={() => {
                if (!loading)
                  void run(async () => {
                    await (signUp ? backend.signUp : backend.signIn)({
                      email,
                      password,
                      name,
                      callbackURL: "/",
                    });
                    setPassword("");
                    const me = await loadMe();
                    go(me.profile.onboarded ? "timeline" : "onboarding");
                  });
              }}
            />
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
              <Button
                label="Find my campus moments"
                onPress={() =>
                  run(async () => {
                    let p = { ...profile, onboarded: true };
                    p = await backend.updateProfile(p);
                    setProfile(p);
                    go("timeline");
                  })
                }
              />
            </View>
          )}
          {user && <View style={page === "timeline" && !selected ? undefined : { display: "none" }}>
            <TimelineExperience key={user.id} active={page === "timeline" && !selected}
              saved={saved} busy={loading} onSave={toggleSave} onDetails={viewEvent}
              onCalendar={(event, reason) => { viewEvent(event, reason); setCalendar(true); }}
              onDiscover={() => { setSearch(""); setCategory("All interests"); setDateFilter("Any day"); go("discover"); }} />
          </View>}
          {user && page === "discover" && !selected && (
            <>
              <View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}>
                <View style={{ gap: 4 }}>
                  <Text accessibilityRole="header" style={s.sectionTitle}>Discover campus</Text>
                  <Text style={s.meta}>All upcoming events. Find your next reason to head out.</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => go("onboarding")}>
                  <Text style={s.linkText}>Edit interests →</Text>
                </Pressable>
              </View>
              <View testID="discovery-filters" style={{ gap: 10 }}>
              <View style={[s.row, s.searchBar]}>
                <Ionicons name="search-outline" size={23} color={C.muted} />
                <TextInput
                  accessibilityLabel="Search campus events"
                  placeholder="Search events, interests, or places…"
                  placeholderTextColor={C.muted}
                  value={search}
                  onChangeText={setSearch}
                  style={{
                    flex: 1,
                    fontFamily: font,
                    fontSize: 16,
                    color: C.ink,
                    padding: 12,
                  }}
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
              <View style={[s.row, { gap: 6 }]}>
                {["Any day", "Today", "This week", "Weekend"].map((d) => (
                  <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: dateFilter === d }}
                    onPress={() => setDateFilter(d)} style={{ paddingHorizontal: 10, borderWidth: 2, borderRadius: 12,
                      backgroundColor: dateFilter === d ? C.pink : "white", borderColor: dateFilter === d ? C.maroon : C.line }}>
                    <Text style={[s.small, { fontWeight: "800", color: dateFilter === d ? C.maroon : C.muted }]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
              </View>
              <View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}>
                <Text style={s.meta} accessibilityLiveRegion="polite">
                  {discovery.totalMatches ?? filtered.length} events · Eastern time
                </Text>
                <Pressable accessibilityRole="button" onPress={() => router.push("/clubs")}>
                  <Text style={s.linkText}>Explore clubs →</Text>
                </Pressable>
              </View>
              {!filtered.length && !loading && !discoveryLoading && (
                <View style={s.panel}>
                  <Text style={s.sectionTitle}>
                    {discovery.totalAvailable
                      ? "No events match just yet."
                      : "No current listings are available."}
                  </Text>
                  <Text style={s.body}>
                    {discovery.totalAvailable
                      ? "Try another interest or a wider date range."
                      : "The campus feed may still be refreshing. Try again in a moment."}
                  </Text>
                  <Button
                    secondary
                    label="Refresh events"
                    onPress={() => setRefreshVersion((version) => version + 1)}
                  />
                </View>
              )}
              <View style={s.eventGrid}>
                {filtered.map(item => <EventCard key={item.event.id} item={item} />)}
              </View>
              {(discovery.totalMatches ?? filtered.length) > 60 && (
                <Text style={s.meta}>Showing the first 60 matches. Use search or filters to narrow your results.</Text>
              )}
              {!!discovery.sportsTicker?.length && (
                <View style={{ gap: 10 }}>
                  <Text style={s.sectionTitle}>HokieSports — latest source schedule</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 12 }}>
                    {discovery.sportsTicker.map(event => (
                      <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`View ${event.title}`} onPress={() => viewEvent(event)} style={[s.panel, { width: 290, gap: 8 }]}>
                        <Text style={s.eyebrowText}>{event.sports?.sport || "HokieSports"}</Text>
                        <Text style={s.eventTitle}>{event.title}</Text>
                        {!!event.sports?.opponent && <Text style={s.meta}>Opponent: {event.sports.opponent}</Text>}
                        <Text style={s.body}>{eventTime(event)} ET</Text>
                        {!!event.sports?.state && <Text style={s.meta}>{event.sports.state}</Text>}
                        {(event.sports?.homeScore != null || event.sports?.awayScore != null) && <Text style={s.body}>Home: {event.sports?.homeScore ?? "—"} · Away: {event.sports?.awayScore ?? "—"}</Text>}
                        {!!event.sports?.checkedAt && <Text style={s.meta}>Source checked {date(event.sports.checkedAt)}</Text>}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
              <View style={s.panel}>
                <Text accessibilityRole="header" style={s.sectionTitle}>Dates to remember</Text>
                <Text style={s.meta}>Academic, application and campus deadlines</Text>
                {!!deadlineStatus && <Text accessibilityLiveRegion="polite" style={s.body}>{deadlineStatus}</Text>}
                {deadlines.map(deadline => (
                  <View key={deadline.id} style={{ gap: 8, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.muted }}>
                    <Text style={s.eventTitle}>{deadlineText(deadline.title)}</Text>
                    <Text style={s.body}>
                      Due {DateTime.fromISO(deadline.dueDate, { zone: deadline.timezone }).toFormat("ccc, LLL d, yyyy")}
                      {deadline.dueAt ? ` · ${DateTime.fromISO(deadline.dueAt).setZone(deadline.timezone).toFormat("h:mm a ZZZZ")}` : " · Time not specified"}
                    </Text>
                    {!!deadline.term && <Text style={s.meta}>{deadline.term}</Text>}
                    {!!deadline.description && <Text style={s.body}>{deadlineText(deadline.description)}</Text>}
                    {!!deadline.audience?.length && <Text style={s.meta}>For {deadline.audience.join(" · ")}</Text>}
                    <View style={s.wrap}>
                      {deadline.submissionUrl && <Button secondary label="Submission details ↗" onPress={() => Linking.openURL(deadline.submissionUrl!)} />}
                      {deadline.sources.map(source => <Button key={`${source.source}:${source.sourceId}`} secondary label={`${source.label || source.source} ↗`} onPress={() => Linking.openURL(source.url)} />)}
                    </View>
                  </View>
                ))}
              </View>
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
                  {(selected.sources[0]?.label || selected.sources[0]?.source || "Campus listing").toUpperCase()}
                </Text>
                <Text accessibilityRole="header" style={s.pageTitle}>
                  {selected.title}
                </Text>
                <Text style={s.body}>
                  {eventTime(selected)}
                  {selected.end && !selected.timeTBD && !selected.allDay && !selected.endEstimated ? " – " + date(selected.end, "h:mm a") : ""} ET
                </Text>
                {selected.timeDetails?.note && <Text style={s.meta}>{selected.timeDetails.note}</Text>}
                {selected.media?.map((media, index) => media.kind === "image" ? (
                  <View key={`${media.url}:${index}`} style={{ gap: 5 }}>
                    <Image source={{ uri: media.url }} accessibilityLabel={media.alt || selected.title} resizeMode="contain" style={{ width: "100%", height: mobile ? 230 : 380, borderRadius: 14 }} />
                    {!!media.credit && <Text style={s.meta}>{media.credit}</Text>}
                  </View>
                ) : <Button key={`${media.url}:${index}`} secondary label={media.alt || "Watch event video ↗"} onPress={() => Linking.openURL(media.url)} />)}
                {selected.sports && (
                  <View style={{ gap: 7 }}>
                    <Text style={s.sectionTitle}>{selected.sports.sport}</Text>
                    {!!selected.sports.opponent && <Text style={s.body}>Opponent: {selected.sports.opponent}</Text>}
                    <Text style={s.meta}>{selected.sports.venueType} · {selected.sports.state}</Text>
                    {(selected.sports.homeScore != null || selected.sports.awayScore != null) && <Text style={s.body}>Home: {selected.sports.homeScore ?? "—"} · Away: {selected.sports.awayScore ?? "—"}</Text>}
                    {(selected.sports.period || selected.sports.clock) && <Text style={s.meta}>{selected.sports.period} {selected.sports.clock}</Text>}
                  </View>
                )}
                <Text style={s.body}>
                  {selected.location ||
                    (selected.isOnline || selected.onlineUrl
                      ? "Online event"
                      : "Location not published. Check the original source.")}
                </Text>
                {!!selected.address && <Text style={s.meta}>{selected.address}</Text>}
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
                {selected.admission && <Text style={s.body}>Admission: {selected.admission.free === true ? "Free" : selected.admission.price || "See source for pricing"}{selected.admission.currency ? ` ${selected.admission.currency}` : ""}{selected.admission.availability ? ` · ${selected.admission.availability}` : ""}</Text>}
                {!!selected.audience?.length && <Text style={s.meta}>For {selected.audience.join(" · ")}</Text>}
                {!!selected.conflicts?.length && <Text style={{ color: C.orange }}>Sources report different details for {selected.conflicts.map(conflict => conflict.field).join(", ")}. Check the original listings; any club-owner corrections remain in place.</Text>}
                <View style={s.wrap}>
                  {selected.registrationUrl && <Button secondary label="Register ↗" onPress={() => Linking.openURL(selected.registrationUrl!)} />}
                  {selected.links?.map((link, index) => <Button key={`${link.url}:${index}`} secondary label={`${link.label || link.kind} ↗`} onPress={() => Linking.openURL(link.url)} />)}
                  {selected.sources.map(source => <Button key={`${source.source}:${source.sourceId}`} secondary label={`${source.label || source.source} ↗`} onPress={() => Linking.openURL(source.url)} />)}
                </View>
                <View style={s.fit}>
                  <Text style={s.body}>
                    {selectedReason || ranked.find((x) => x.event.id === selected.id)?.reason ||
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
                  <Text style={s.meta}>
                    Download the file, then open it in your calendar app to import.
                  </Text>
                  <Button disabled={loading} loading={loading}
                    label="Download calendar file" onPress={() => download(selected)}
                  />
                </View>
              )}
            </View>
          )}
          {user && page === "saved" && !selected && (
            <>
              <Text style={s.eyebrowText}>KEEP THE GOOD ONES CLOSE</Text>
              <Text accessibilityRole="header" style={s.pageTitle}>
                Your saved events
              </Text>
              <Text style={s.body}>
                Things you’re looking forward to, all in one place.
              </Text>
              {!saved.length && (
                <View style={s.panel}>
                  <Gobbler size={110} />
                  <Text style={s.sectionTitle}>No saved events yet.</Text>
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
              {!!discovery.unavailableSavedIds?.length && (
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
                MAKE ROOM FOR SOMETHING GOOD
              </Text>
              <Text accessibilityRole="header" style={s.pageTitle}>
                Your week, with possibilities
              </Text>
              <Text style={s.body}>
                Saved events and the availability you choose to share, together.
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
                  Help from My Gobbler.
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
                  label="Find my next event"
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
                  {answer.publicMemory && (
                    <View style={s.panel}>
                      <Text accessibilityRole="header" style={s.sectionTitle}>Public history</Text>
                      <Text style={s.meta}>Matching event, deadline and organizer records from public sources.</Text>
                      {answer.publicMemory.events.map(event => (
                        <View key={event.id} style={{ gap: 7, paddingVertical: 12 }}>
                          <Text style={s.eventTitle}>{event.title}</Text>
                          <Text style={s.meta}>{eventTime(event)} · {event.status}</Text>
                          {!!event.description && <Text style={s.body}>{event.description}</Text>}
                          <View style={s.wrap}>
                            {event.sources.map(source => <Button key={`${source.source}:${source.sourceId}`} secondary label={`${source.label || source.source} ↗`} onPress={() => Linking.openURL(source.url)} />)}
                          </View>
                        </View>
                      ))}
                      {answer.publicMemory.deadlines.map(deadline => (
                        <View key={deadline.id} style={{ gap: 7, paddingVertical: 12 }}>
                          <Text style={s.eventTitle}>{deadline.title}</Text>
                          <Text style={s.meta}>Due {DateTime.fromISO(deadline.dueDate, { zone: deadline.timezone }).toFormat("LLL d, yyyy")}{deadline.dueAt ? ` · ${DateTime.fromISO(deadline.dueAt).setZone(deadline.timezone).toFormat("h:mm a ZZZZ")}` : ""} · {deadline.status}</Text>
                          {!!deadline.term && <Text style={s.meta}>{deadline.term}</Text>}
                          {!!deadline.description && <Text style={s.body}>{deadline.description}</Text>}
                          <View style={s.wrap}>
                            {deadline.sources.map(source => <Button key={`${source.source}:${source.sourceId}`} secondary label={`${source.label || source.source} ↗`} onPress={() => Linking.openURL(source.url)} />)}
                          </View>
                        </View>
                      ))}
                      {answer.publicMemory.clubs.map(club => (
                        <View key={club.id} style={{ gap: 7, paddingVertical: 12 }}>
                          <Text style={s.eventTitle}>{club.name}</Text>
                          <Text style={s.meta}>{club.verified ? "Verified organizer record" : "Public organizer record · ownership unverified"}</Text>
                          {!!club.description && <Text style={s.body}>{club.description}</Text>}
                          <View style={s.wrap}>
                            {club.sourceUrls.map((url, index) => <Button key={`${url}:${index}`} secondary label={`Organizer source ${index + 1} ↗`} onPress={() => Linking.openURL(url)} />)}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </>
          )}
          {user && page === "settings" && (
            <>
              <Text style={s.eyebrowText}>YOUR GOBBLER, YOUR WAY</Text>
              <Text accessibilityRole="header" style={s.pageTitle}>
                Preferences
              </Text>
              <View style={[s.columns, mobile && { flexDirection: "column" }]}>
                <View style={{ flex: 1, gap: 24 }}>
                  <View style={s.panel}>
                    <Text style={s.sectionTitle}>About you</Text>
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
                          {sourceLabel(key)}{" "}
                          · {sourceStatusText(value.status)}
                        </Text>
                        {!!value.lastSync && (
                          <Text style={s.meta}>Last checked {date(value.lastSync)}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                  <View style={s.panel}>
                    <Text style={s.sectionTitle}>Your data, your choice</Text>
                    <Text style={s.body}>
                      {
                        "Delete your profile, saved events, and preferences from My Gobbler."
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
        {(page !== "timeline" || !!selected) && <View style={s.footer}>
          <View style={[s.brand, { gap: 12 }]}>
            <Gobbler head size={46} decorative />
            <Text style={[s.brandText, { color: "#FFF8F2" }]}>My Gobbler</Text>
          </View>
          <Text style={[s.meta, { color: "#F6D9C6", textAlign: "center" }]}>
            Your campus. Your kind of day.
          </Text>
          <Text
            style={[
              s.small,
              { color: "#F6D9C6", textAlign: "center", maxWidth: 510 },
            ]}
          >
            Made with Hokie spirit. Student-built and independently run. Not
            affiliated with or endorsed by Virginia Tech.
          </Text>
          <Text style={[s.small, { color: "#F6D9C6" }]}>
            © {new Date().getFullYear()} My Gobbler
          </Text>
        </View>}
      </ScrollView>
    </View>
  );
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
  brandGroup: { flexDirection: "row", alignItems: "center", gap: 16, flexShrink: 1 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  bannerLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.cream,
  },
  bannerLinkText: {
    fontFamily: font,
    fontSize: 14,
    fontWeight: "800",
    color: C.maroon,
  },
  brandText: {
    fontFamily: font,
    fontSize: 25,
    fontWeight: "900",
    color: C.maroon,
    letterSpacing: -0.7,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  navText: { fontFamily: font, fontSize: 15, color: C.muted },
  main: {
    width: "100%",
    maxWidth: 1240,
    alignSelf: "center",
    paddingVertical: 40,
    gap: 24,
    flex: 1,
  },
  eyebrowText: {
    fontFamily: font,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: C.maroon,
  },
  body: { fontFamily: font, fontSize: 16, lineHeight: 25, color: C.ink },
  meta: { fontFamily: font, fontSize: 14, lineHeight: 21, color: C.muted },
  small: { fontFamily: font, fontSize: 12, lineHeight: 18, color: C.muted },
  label: { fontFamily: font, fontSize: 14, fontWeight: "700", color: C.ink },
  pageTitle: {
    fontFamily: font,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -1.1,
    color: C.maroon,
  },
  sectionTitle: {
    fontFamily: font,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: C.ink,
  },
  eventTitle: {
    fontFamily: font,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: C.ink,
  },
  linkText: {
    fontFamily: font,
    fontSize: 14,
    fontWeight: "700",
    color: C.maroon,
  },
  panel: {
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 16,
    padding: 24,
    gap: 18,
  },
  welcome: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEECF",
    padding: 32,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#EDD9AF",
    gap: 20,
  },
  searchBar: {
    borderWidth: 2,
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
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 16,
    backgroundColor: "white",
    overflow: "hidden",
    boxShadow: "0 4px 0 #E7D8CD",
  },
  eventTop: {
    height: 200,
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
    fontFamily: font,
    fontSize: 12,
    fontWeight: "700",
    color: C.maroon,
    letterSpacing: 1,
  },
  dateDay: {
    fontFamily: font,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "700",
    color: C.maroon,
  },
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
    padding: 10,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 12,
    backgroundColor: C.paper,
  },
  columns: { flexDirection: "row", gap: 28, alignItems: "flex-start" },
  divider: { height: 1, backgroundColor: C.line },
  toast: { backgroundColor: "#EBF4EB", padding: 14, borderRadius: 10 },
  footer: {
    alignItems: "center",
    gap: 9,
    borderTopWidth: 1,
    borderColor: C.line,
    padding: 40,
    backgroundColor: C.burgundy,
  },
});
