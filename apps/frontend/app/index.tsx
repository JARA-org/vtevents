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
  UserSummary,
  SourceHealth,
  HealthView,
  UserMemoryView,
} from "@gobbler/shared";
import { AskGobbler, type GobblerTurn } from "../components/AskGobbler";
import { useGobblerChat } from "../components/GobblerChatState";
import { AssistantMemories } from "../components/AssistantMemories";
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
    [searchDraft, setSearchDraft] = useState(""),
    [searchMode, setSearchMode] = useState<"keyword" | "semantic">("semantic"),
    [category, setCategory] = useState("All interests"),
    [dateFilter, setDateFilter] = useState("Any day"),
    [selected, setSelected] = useState<CampusEvent | null>(null),
    [selectedReason, setSelectedReason] = useState(""),
    [loading, setLoading] = useState(false),
    [toast, setToast] = useState(""),
    [sources, setSources] = useState<Record<string, SourceHealth>>({}),
    [health, setHealth] = useState<Partial<HealthView>>({}),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signUp, setSignUp] = useState(false),
    [name, setName] = useState(""),
    [deleteText, setDeleteText] = useState(""),
    [memory, setMemory] = useState<UserMemoryView | null>(null),
    [deadlines, setDeadlines] = useState<CampusDeadline[]>([]),
    [deadlineStatus, setDeadlineStatus] = useState("Loading deadlines…"),
    [discovery, setDiscovery] = useState<DiscoveryView>({
      recommendations: [],
      filtered: [],
      savedRecommendations: [],
    });
  const chatState = useGobblerChat();
  useEffect(() => { setSearch(""); setSearchDraft(""); }, [user?.id]);
  const submitSearch = () => { setSearch(searchDraft.trim()); setRefreshVersion(v => v + 1); };
  const chat = user && chatState.owner === user.id ? chatState.turns : [];
  const setChat = (turns: GobblerTurn[]) => { if (user) chatState.update(user.id, turns); else chatState.clear(); };
  const answer = chat.at(-1)?.reply;
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
  // Submitting intent only. Whether attendance is allowed, and what memory holds
  // afterwards, are decided and returned by the backend.
  const confirmAttendance = (eventId: string, attended: boolean) =>
    run(async () => {
      setMemory(await backend.setAttendance({ eventId, attended }));
      notify(
        attended
          ? "Gobbler will remember you went to this."
          : "Removed from your attended events.",
      );
    });
  const forgetActivity = () =>
    run(async () => {
      setMemory(await backend.forgetMemory({ scope: "attendance" }));
      notify("Gobbler forgot your attended events.");
    });
  const attended = (eventId: string) =>
    !!memory?.attendance.some((record) => record.eventId === eventId);
  const go = (p: Page) => {
    setPage(p);
    setSelected(null);
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
  // The backend owns what memory contains and who may read it; this only renders
  // whatever the session returns and clears it when nobody is signed in.
  useEffect(() => {
    if (!user) {
      setMemory(null);
      return;
    }
    let active = true;
    setMemory(null);
    backend
      .getMemory(undefined)
      .then((view) => {
        if (active) setMemory(view);
      })
      .catch(() => {
        if (active) setMemory(null);
      });
    return () => {
      active = false;
    };
  }, [user, refreshVersion]);
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
    if (!user || !["discover", "saved"].includes(page)) {
      setDiscoveryLoading(false);
      return;
    }
    let active = true;
    setDiscoveryLoading(true);
    setDiscovery({
      recommendations: [],
      filtered: [],
      savedRecommendations: [],
    });
    const timer = setTimeout(() => {
      backend
        .discover({
          limit: 60,
          search,
          searchMode: page === "discover" ? searchMode : "keyword",
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
    searchMode,
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
    if (user)
      backend.track({ kind: "event_view", eventId: e.id }).catch(() => {});
  };
  function EventCard({
    item,
    compact = false,
  }: {
    item: Recommendation;
    compact?: boolean;
  }) {
    const { event: e, reason } = item;
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
            disabled={loading}
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
              {(["timeline", "discover", "saved", "gobbler"] as Page[]).map(
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
            {(["timeline", "discover", "saved", "gobbler"] as Page[]).map(
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
                  value={searchDraft}
                  onChangeText={setSearchDraft}
                  onSubmitEditing={submitSearch}
                  style={{
                    flex: 1,
                    fontFamily: font,
                    fontSize: 16,
                    color: C.ink,
                    padding: 12,
                  }}
                />
                <Button label="Search" onPress={submitSearch} />
              </View>
              <View style={s.wrap}>
                <Chip label="By meaning" active={searchMode === "semantic"} onPress={() => setSearchMode("semantic")} />
                <Chip label="Exact keywords" active={searchMode === "keyword"} onPress={() => setSearchMode("keyword")} />
              </View>
              <Text style={s.meta}>Search by meaning sends your search phrase to Gemini when personalized AI is enabled. Search text is not stored.</Text>
              {!!discovery.search && <Text style={s.meta} accessibilityLiveRegion="polite">{discovery.search.notice}</Text>}
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
                  <Text style={s.sectionTitle}>HokieSports — latest events</Text>
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
                  {/* Explicit confirmation only. Saving or viewing this event never
                      tells Gobbler you went; the backend rejects events that have
                      not started yet and explains why. */}
                  <Button
                    secondary={!attended(selected.id)}
                    icon={attended(selected.id) ? "checkmark-circle" : "person-outline"}
                    label={attended(selected.id) ? "You went to this" : "I went to this"}
                    onPress={() =>
                      confirmAttendance(selected.id, !attended(selected.id))
                    }
                  />
                  {selected.registrationUrl && <Button secondary label="Register ↗" onPress={() => Linking.openURL(selected.registrationUrl!)} />}
                  {selected.links?.map((link, index) => <Button key={`${link.url}:${index}`} secondary label={`${link.label || link.kind} ↗`} onPress={() => Linking.openURL(link.url)} />)}
                  {selected.sources.map(source => <Button key={`${source.source}:${source.sourceId}`} secondary label={`${source.label || source.source} ↗`} onPress={() => Linking.openURL(source.url)} />)}
                </View>
                <View style={s.recommendationNote}>
                  <Text style={s.body}>
                    {selectedReason || ranked.find((x) => x.event.id === selected.id)?.reason ||
                      "Explore this event for more details."}
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
          {user && page === "gobbler" && !selected && (
            <>
              <AskGobbler key={user.id} profile={profile} turns={chat} onTurns={setChat}
                onDiscover={() => go("discover")} onSaved={() => go("saved")} onSettings={() => go("settings")} />
              {answer && (
                <>
                  <View style={s.eventGrid}>
                    {answer.recommendations.map((item) => (
                      <EventCard key={item.event.id} item={item} />
                    ))}
                  </View>
                  {answer.clubHistory && (
                    <View style={s.panel}>
                      <Text accessibilityRole="header" style={s.sectionTitle}>
                        {answer.clubHistory.matched
                          ? `What ${answer.clubHistory.matched.name} has done before`
                          : "Past activity"}
                      </Text>
                      <Text style={s.meta}>
                        These events already happened. They are not upcoming plans.
                        {answer.clubHistory.matched?.kind === "observed-organizer"
                          ? " This name was observed on public listings, which does not confirm a club's identity or ownership."
                          : ""}
                      </Text>
                      {answer.clubHistory.missing ? (
                        <Text style={s.body}>
                          Nothing is stored for that name yet, so Gobbler has no
                          history to show rather than a guess.
                        </Text>
                      ) : (
                        answer.clubHistory.entries.map((entry) => (
                          <View key={entry.eventId} style={{ gap: 6, paddingVertical: 10 }}>
                            <Text style={s.eventTitle}>{entry.title}</Text>
                            <Text style={s.meta}>
                              {date(entry.start, "ccc, LLL d, yyyy")}
                              {entry.categories.length ? ` · ${entry.categories.join(" · ")}` : ""}
                            </Text>
                            <View style={s.wrap}>
                              <Button
                                secondary
                                label="Original listing ↗"
                                onPress={() => Linking.openURL(entry.sourceUrl)}
                              />
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  )}
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
                      accessibilityState={{ checked: profile.aiEnabled && profile.assistantConsentVersion === 1 }}
                      onPress={() =>
                        saveProfile({
                          ...profile,
                          aiEnabled: !(profile.aiEnabled && profile.assistantConsentVersion === 1),
                          assistantConsentVersion: 1,
                        })
                      }
                      style={s.row}
                    >
                      <Ionicons
                        name={profile.aiEnabled && profile.assistantConsentVersion === 1 ? "checkbox" : "square-outline"}
                        size={25}
                        color={C.maroon}
                      />
                      <Text style={[s.body, { flex: 1 }]}>
                        Enable personalized Gemini chat
                      </Text>
                    </Pressable>
                    <Text style={s.meta}>
                      When enabled, your search phrases, current chat, interest categories, relevant
                      saved events, confirmed preferences and public listings are sent
                      to Google Gemini. Don’t include sensitive details. Account
                      identity and credentials are not sent. Google’s free tier may
                      use prompts and replies to improve its products. Chat history
                      is temporary; confirmed preferences stay until you remove them.
                    </Text>
                  </View>
                  <View style={s.panel}><AssistantMemories key={user.id} /></View>
                  <View style={s.panel}>
                    <Text accessibilityRole="header" style={s.sectionTitle}>
                      What Gobbler remembers about you
                    </Text>
                    <Text style={s.meta}>
                      Only you can see this. It is never added to a club’s
                      records or shown to anyone else.
                    </Text>
                    {!memory ? <Text style={s.body}>Memory is loading or unavailable. Please refresh to try again.</Text> : <>
                    <Text style={[s.body, { fontWeight: "700" }]}>
                      Interests you chose
                    </Text>
                    <Text style={s.body}>
                      {memory?.statedInterests.length
                        ? memory.statedInterests.join(" · ")
                        : "None chosen yet."}
                    </Text>
                    <Text style={[s.body, { fontWeight: "700" }]}>
                      Interests Gobbler guessed
                    </Text>
                    <Text style={s.meta}>
                      Worked out from the events you confirmed attending, and
                      kept separate from the interests you chose.
                    </Text>
                    <Text style={s.body}>
                      {memory?.inferredInterests.length
                        ? memory.inferredInterests
                            .map(
                              (item) =>
                                `${item.category} (${item.fromAttendance} ${item.fromAttendance === 1 ? "event" : "events"})`,
                            )
                            .join(" · ")
                        : "Nothing guessed yet. Confirm an event you attended and it will appear here."}
                    </Text>
                    {!!memory?.confirmable?.length && (
                      <>
                        <Text style={[s.body, { fontWeight: "700" }]}>
                          Did you go to these?
                        </Text>
                        <Text style={s.meta}>
                          Events you saved that have since finished. Gobbler only
                          remembers the ones you confirm; ignoring these keeps no
                          record at all.
                        </Text>
                        {memory.confirmable.map((candidate) => (
                          <View key={candidate.eventId} style={{ gap: 6, paddingVertical: 8 }}>
                            <Text style={s.body}>{candidate.title}</Text>
                            <Text style={s.meta}>
                              {date(candidate.start, "ccc, LLL d, yyyy")}
                              {candidate.organizer ? ` · ${candidate.organizer}` : ""}
                            </Text>
                            <View style={s.wrap}>
                              <Button
                                icon="checkmark-outline"
                                label="I went"
                                onPress={() => confirmAttendance(candidate.eventId, true)}
                              />
                            </View>
                          </View>
                        ))}
                      </>
                    )}
                    <Text style={[s.body, { fontWeight: "700" }]}>
                      Events you said you attended
                    </Text>
                    {memory?.attendance.length ? (
                      memory.attendance.map((record) => (
                        <View key={record.eventId} style={{ gap: 6, paddingVertical: 8 }}>
                          <Text style={s.body}>{record.title}</Text>
                          <Text style={s.meta}>
                            {date(record.start, "ccc, LLL d, yyyy")}
                            {record.organizer ? ` · ${record.organizer}` : ""}
                            {record.available === false
                              ? " · the original listing is no longer available, so Gobbler leaves this out of its answers"
                              : ""}
                          </Text>
                          <View style={s.wrap}>
                            {!!record.sourceUrl && (
                              <Button
                                secondary
                                label="Original listing ↗"
                                onPress={() => Linking.openURL(record.sourceUrl!)}
                              />
                            )}
                            <Button
                              secondary
                              icon="close-outline"
                              label="Remove"
                              onPress={() => confirmAttendance(record.eventId, false)}
                            />
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={s.body}>
                        Nothing yet. Open an event you went to and choose “I went
                        to this”. Saving or viewing an event never counts as
                        attending.
                      </Text>
                    )}
                    {!!memory?.attendance.length && (
                      <Button
                        secondary
                        icon="trash-outline"
                        label="Forget my attended events"
                        onPress={forgetActivity}
                      />
                    )}
                    </>}
                  </View>
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
                              chatState.clear();
                              setDiscovery({
                                recommendations: [],
                                filtered: [],
                                savedRecommendations: [],
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
                              chatState.clear();
                              setDiscovery({
                                recommendations: [],
                                filtered: [],
                                savedRecommendations: [],
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
  recommendationNote: {
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
