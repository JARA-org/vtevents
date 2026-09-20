import React, { useEffect, useId, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Switch,
  Linking,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Chip, Gobbler } from "../components/ui";
import { C, font } from "../components/theme";
import type {
  ManagedClub,
  ClubWorkspace,
  ClubEventEdit,
  ClubEventValues,
  Category,
} from "@gobbler/shared";
import { useGobblerChat } from "../components/GobblerChatState";
import { backend } from "../services/backend";

function DateField({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: "date" | "time";
}) {
  const id = useId();
  return (
    <View style={[styles.field, { flexGrow: 1 }]}>
      <Text nativeID={id} style={styles.label}>
        {label}
      </Text>
      {Platform.OS === "web" ? (
        React.createElement("input", {
          type,
          value,
          "aria-labelledby": id,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value),
          style: {
            fontFamily: font,
            fontSize: 16,
            color: C.ink,
            backgroundColor: C.surface,
            border: "2px solid " + C.line,
            borderRadius: 10,
            padding: 12,
            width: "100%",
            boxSizing: "border-box",
            minHeight: 48,
          },
        })
      ) : (
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          placeholder={type === "date" ? "YYYY-MM-DD" : "HH:mm"}
          style={styles.input}
        />
      )}
    </View>
  );
}

export default function ClubsPage() {
  const chatState = useGobblerChat();
  const params = useLocalSearchParams<{ club?: string; event?: string }>();
  const compact = useWindowDimensions().width < 760;
  const [signedIn, setSignedIn] = useState(false),
    [ready, setReady] = useState(false),
    [register, setRegister] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [personName, setPersonName] = useState(""),
    [name, setName] = useState("");
  const [clubs, setClubs] = useState<ManagedClub[]>([]),
    [canCreate, setCanCreate] = useState(false);
  const [workspace, setWorkspace] = useState<ClubWorkspace | null>(null),
    [edit, setEdit] = useState<ClubEventEdit | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ticket, setTicket] = useState<string | undefined>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const requestId = useRef(String(Date.now()) + "-club-create");
  async function loadClubs() {
    const result = await backend.myClubs();
    setClubs(result.clubs);
    setCanCreate(result.canCreate === true);
    setSignedIn(true);
  }
  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        "discord",
      );
      if (token) {
        setTicket(token);
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    }
    void loadClubs()
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Account services are unavailable.",
        ),
      )
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    void backend
      .bootstrap(undefined)
      .then((result) => setCategories(result.categories))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load categories."),
      );
  }, [signedIn]);
  useEffect(() => {
    if (!signedIn) return;
    const clubId = typeof params.club === "string" ? params.club : clubs[0]?.id;
    if (!clubId) return;
    let active = true;
    setWorkspace(null);
    backend
      .clubWorkspace({ clubId })
      .then((result) => {
        if (active) setWorkspace(result);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to open your club.",
          );
      });
    return () => {
      active = false;
    };
  }, [signedIn, clubs, params.club]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function draft(values: Partial<ClubEventValues>) {
    if (edit) setEdit({ ...edit, values: { ...edit.values, ...values } });
  }
  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    multiline = false,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        style={[
          styles.input,
          multiline && { minHeight: 110, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Gobbler size={44} />
          <Text style={styles.brandName}>My Gobbler</Text>
        </View>
        <Button
          secondary
          label={compact ? "Discover" : "Discover events"}
          onPress={() => router.push("/?page=discover")}
        />
      </View>
      <ScrollView
        contentContainerStyle={[styles.page, compact && { padding: 16 }]}
      >
        <View style={styles.container}>
          <View style={styles.hero}>
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={styles.eyebrow}>YOUR CLUB · YOUR CAMPUS</Text>
              <Text style={[styles.heading, compact && { fontSize: 30 }]}>
                {workspace?.club.name || "Make campus happen."}
              </Text>
              <Text style={styles.body}>
                Your announcements, all in one place. Keep your club’s events up
                to date and ready for campus.
              </Text>
            </View>
            {!compact && <Gobbler size={120} />}
          </View>
          {ticket && (
            <Text style={styles.notice}>
              Your Discord setup link is ready. Create your club or connect it
              below before this ten-minute link expires.
            </Text>
          )}
          {!!error && !edit && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {!!notice && (
            <Text accessibilityRole="alert" style={styles.notice}>
              {notice}
            </Text>
          )}
          {!ready ? (
            <Text style={styles.body}>Loading your workspace…</Text>
          ) : !signedIn ? (
            <View
              style={[
                styles.panel,
                { maxWidth: 520, width: "100%", alignSelf: "center" },
              ]}
            >
              <Text style={styles.title}>
                {register ? "Create your account" : "Welcome back"}
              </Text>
              <Text style={styles.body}>
                Sign in to manage your club’s events.
              </Text>
              {register && field("Your name", personName, setPersonName)}
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  accessibilityLabel="Password"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                />
              </View>
              {register && (
                <Text style={styles.body}>Use at least 12 characters.</Text>
              )}
              <Button
                label={register ? "Create account" : "Sign in"}
                loading={busy}
                onPress={() =>
                  void run(async () => {
                    if (register)
                      await backend.signUp({
                        name: personName,
                        email,
                        password,
                      });
                    else await backend.signIn({ email, password });
                    setPassword("");
                    await loadClubs();
                  })
                }
              />
              <Button
                secondary
                label={
                  register ? "Already registered? Sign in" : "Create an account"
                }
                disabled={busy}
                onPress={() => setRegister(!register)}
              />
            </View>
          ) : (
            <View
              style={[styles.columns, compact && { flexDirection: "column" }]}
            >
              <View style={[styles.sidebar, compact && { width: "100%" }]}>
                <View style={styles.panel}>
                  <Text style={styles.eyebrow}>CLUB WORKSPACE</Text>
                  {clubs.map((club) => (
                    <View key={club.id} style={styles.group}>
                      <Text style={styles.title}>{club.name}</Text>
                      <Text style={styles.body}>
                        {club.discordGuildId
                          ? "Discord connected"
                          : "Discord not connected"}
                      </Text>
                      {ticket && (
                        <Button
                          label="Connect Discord"
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              await backend.linkClubDiscord({
                                clubId: club.id,
                                discordTicket: ticket,
                              });
                              setTicket(undefined);
                              await loadClubs();
                            })
                          }
                        />
                      )}
                    </View>
                  ))}
                  {!clubs.length && (
                    <Text style={styles.body}>
                      Your club workspace starts here.
                    </Text>
                  )}
                  <Button
                    secondary
                    label="Sign out"
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await backend.signOut({});
                        chatState.clear();
                        setSignedIn(false);
                        setClubs([]);
                        setWorkspace(null);
                        setEdit(null);
                      })
                    }
                  />
                </View>
                <View style={styles.tip}>
                  <Text style={styles.label}>From Discord to campus</Text>
                  <Text style={styles.body}>
                    Qualifying announcements publish automatically. Use Edit
                    event to correct details afterward.
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 20 }}>
                {canCreate && !ticket && (
                  <View style={styles.panel}>
                    <Text style={styles.title}>
                      Start from your Discord server
                    </Text>
                    <Text style={styles.body}>
                      A server administrator must run /gobbler setup in Discord
                      and open the private setup link to create a club
                      workspace.
                    </Text>
                  </View>
                )}
                {canCreate && ticket && (
                  <View style={styles.panel}>
                    <Text style={styles.title}>Create your club workspace</Text>
                    <Text style={styles.body}>
                      Set up a new club identity for your announcements.
                    </Text>
                    {field("Club name", name, setName)}
                    <Button
                      label={
                        ticket
                          ? "Create club and connect Discord"
                          : "Create club"
                      }
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          await backend.createClub({
                            name,
                            requestId: requestId.current,
                            discordTicket: ticket,
                          });
                          setTicket(undefined);
                          setName("");
                          requestId.current =
                            String(Date.now()) + "-club-create";
                          await loadClubs();
                        })
                      }
                    />
                  </View>
                )}
                {workspace ? (
                  <>
                    <View style={styles.sectionHeader}>
                      <View style={{ gap: 4 }}>
                        <Text style={styles.title}>Your events</Text>
                        <Text style={styles.body}>
                          Published events, including past announcements.
                        </Text>
                      </View>
                      <Button
                        secondary
                        label="Refresh"
                        disabled={busy}
                        onPress={() =>
                          void run(async () =>
                            setWorkspace(
                              await backend.clubWorkspace({
                                clubId: workspace.club.id,
                              }),
                            ),
                          )
                        }
                      />
                    </View>
                    {!workspace.events.length && (
                      <View
                        style={[
                          styles.panel,
                          { alignItems: "center", paddingVertical: 40 },
                        ]}
                      >
                        <Gobbler size={90} />
                        <Text style={styles.title}>
                          Your next event starts here
                        </Text>
                        <Text style={styles.body}>
                          Post an announcement in a watched Discord channel.
                          Once published, it will appear here.
                        </Text>
                      </View>
                    )}
                    {workspace.events.map((event) => {
                      const editable = workspace.editableEvents?.find(
                        (item) => item.eventId === event.id,
                      );
                      const dateFormat = new Intl.DateTimeFormat("en-US", {
                        timeZone: event.timezone,
                        dateStyle: "medium",
                        ...(!event.timeTBD
                          ? { timeStyle: "short" as const }
                          : {}),
                      });
                      return (
                        <View key={event.id} style={styles.eventCard}>
                          <View style={styles.eventTop}>
                            <Text style={styles.eyebrow}>
                              {event.categories.join(" · ")}
                            </Text>
                            <Text style={styles.meta}>Published</Text>
                          </View>
                          <View style={styles.eventBody}>
                            <Text style={styles.title}>{event.title}</Text>
                            <Text style={styles.eventDate}>
                              {dateFormat.format(new Date(event.start))}
                              {event.end
                                ? " – " + dateFormat.format(new Date(event.end))
                                : ""}
                              {event.timeTBD ? " · Time to be confirmed" : ""}
                            </Text>
                            <Text style={styles.meta}>{event.timezone}</Text>
                            <Text style={styles.body}>
                              {event.location || "Online event"}
                            </Text>
                            {!!event.description && (
                              <Text numberOfLines={3} style={styles.body}>
                                {event.description}
                              </Text>
                            )}
                            {event.onlineUrl && (
                              <Text
                                accessibilityRole="link"
                                onPress={() =>
                                  void Linking.openURL(event.onlineUrl!)
                                }
                                style={styles.link}
                              >
                                Watch / join online ↗
                              </Text>
                            )}
                            {editable && (
                              <View
                                style={{
                                  alignSelf: "flex-start",
                                  marginTop: 8,
                                }}
                              >
                                <Button
                                  label="Edit event"
                                  icon="create-outline"
                                  disabled={busy}
                                  onPress={() => {
                                    setError("");
                                    setNotice("");
                                    setEdit({
                                      ...editable,
                                      values: { ...editable.values },
                                    });
                                  }}
                                />
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </>
                ) : (
                  !!clubs.length && (
                    <Text style={styles.body}>Loading your events…</Text>
                  )
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      <Modal
        visible={!!edit}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setEdit(null);
        }}
      >
        <View style={[styles.overlay, compact && { padding: 8 }]}>
          {edit && (
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.eyebrow}>CLUB EVENT</Text>
                <Text style={styles.title}>Make it just right</Text>
                <Text style={styles.body}>
                  Update the details shown on My Gobbler.
                </Text>
              </View>
              <ScrollView contentContainerStyle={styles.modalBody}>
                {!!error && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                )}
                {field("Event title", edit.values.title, (title) =>
                  draft({ title }),
                )}
                {field(
                  "Description",
                  edit.values.description,
                  (description) => draft({ description }),
                  true,
                )}
                <Text style={styles.label}>Date & time</Text>
                <Text style={styles.body}>
                  All dates and times are in America/New_York. Leave the end
                  date blank for a same-day event.
                </Text>
                <View
                  style={[
                    styles.dateRow,
                    compact && { flexDirection: "column" },
                  ]}
                >
                  <DateField
                    label="Start date"
                    type="date"
                    value={edit.values.date}
                    onChange={(date) => draft({ date })}
                  />
                  <DateField
                    label="Start time"
                    type="time"
                    value={edit.values.startTime || ""}
                    onChange={(startTime) =>
                      draft({ startTime: startTime || null })
                    }
                  />
                </View>
                <View
                  style={[
                    styles.dateRow,
                    compact && { flexDirection: "column" },
                  ]}
                >
                  <DateField
                    label="End date"
                    type="date"
                    value={edit.values.endDate || ""}
                    onChange={(endDate) => draft({ endDate: endDate || null })}
                  />
                  <DateField
                    label="End time"
                    type="time"
                    value={edit.values.endTime || ""}
                    onChange={(endTime) => draft({ endTime: endTime || null })}
                  />
                </View>
                {field(
                  "Physical location",
                  edit.values.location || "",
                  (location) => draft({ location: location || null }),
                )}
                {field(
                  "Online link",
                  edit.values.onlineUrl || "",
                  (onlineUrl) => draft({ onlineUrl: onlineUrl || null }),
                )}
                <View style={styles.sectionHeader}>
                  <Text style={styles.label}>Online attendance available</Text>
                  <Switch
                    accessibilityLabel="Online attendance available"
                    value={edit.values.isOnline}
                    onValueChange={(isOnline) => draft({ isOnline })}
                  />
                </View>
                <Text style={styles.label}>Categories</Text>
                <View style={styles.chips}>
                  {categories.map((category) => (
                    <Chip
                      key={category}
                      label={category}
                      active={edit.values.categories?.includes(category)}
                      onPress={() =>
                        draft({
                          categories: edit.values.categories?.includes(category)
                            ? edit.values.categories.filter(
                                (item) => item !== category,
                              )
                            : [...(edit.values.categories || []), category],
                        })
                      }
                    />
                  ))}
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <Button
                  secondary
                  label="Cancel"
                  disabled={busy}
                  onPress={() => {
                    setEdit(null);
                    setError("");
                  }}
                />
                <Button
                  label="Save changes"
                  loading={busy}
                  onPress={() =>
                    void run(async () => {
                      await backend.editClubEvent(edit);
                      if (workspace)
                        setWorkspace(
                          await backend.clubWorkspace({
                            clubId: workspace.club.id,
                          }),
                        );
                      setEdit(null);
                      setNotice("Your event has been updated.");
                    })
                  }
                />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  header: {
    backgroundColor: C.surface,
    borderBottomWidth: 2,
    borderColor: C.line,
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandName: {
    fontFamily: font,
    fontSize: 22,
    fontWeight: "900",
    color: C.maroon,
  },
  page: { padding: 32, flexGrow: 1 },
  container: { width: "100%", maxWidth: 1200, alignSelf: "center", gap: 24 },
  hero: {
    backgroundColor: C.cream,
    borderRadius: 22,
    padding: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    borderWidth: 2,
    borderColor: C.line,
  },
  heading: {
    fontFamily: font,
    fontSize: 40,
    fontWeight: "900",
    color: C.maroon,
  },
  eyebrow: {
    fontFamily: font,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: C.maroon,
  },
  title: { fontFamily: font, fontSize: 24, fontWeight: "800", color: C.maroon },
  body: { fontFamily: font, fontSize: 16, lineHeight: 24, color: C.muted },
  meta: { fontFamily: font, fontSize: 13, lineHeight: 20, color: C.muted },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  sidebar: { width: 280, gap: 16 },
  panel: {
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 18,
    padding: 24,
    gap: 16,
  },
  tip: { padding: 20, borderRadius: 16, backgroundColor: C.cream, gap: 8 },
  group: { gap: 12 },
  sectionHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  field: { gap: 7, flexShrink: 0, minWidth: 0 },
  label: { fontFamily: font, fontSize: 15, fontWeight: "800", color: C.ink },
  input: {
    fontFamily: font,
    fontSize: 16,
    color: C.ink,
    borderWidth: 2,
    borderColor: C.line,
    backgroundColor: C.surface,
    padding: 12,
    borderRadius: 10,
    minHeight: 48,
  },
  notice: {
    fontFamily: font,
    fontSize: 16,
    lineHeight: 24,
    color: C.maroon,
    backgroundColor: C.cream,
    padding: 16,
    borderRadius: 12,
  },
  error: {
    fontFamily: font,
    color: C.red,
    backgroundColor: C.pink,
    padding: 14,
    borderRadius: 10,
  },
  eventCard: {
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 18,
    backgroundColor: C.surface,
    overflow: "hidden",
  },
  eventTop: {
    backgroundColor: C.cream,
    paddingHorizontal: 24,
    paddingVertical: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  eventBody: { padding: 24, gap: 10 },
  eventDate: {
    fontFamily: font,
    fontSize: 17,
    fontWeight: "800",
    color: C.ink,
  },
  link: {
    fontFamily: font,
    fontSize: 16,
    fontWeight: "800",
    color: C.maroon,
    textDecorationLine: "underline",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,1,1,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 740,
    maxHeight: "94%",
    backgroundColor: C.paper,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: C.line,
  },
  modalHeader: { backgroundColor: C.cream, padding: 24, gap: 6 },
  modalBody: { padding: 24, gap: 18 },
  dateRow: { flexDirection: "row", gap: 16 },
  modalFooter: {
    padding: 20,
    borderTopWidth: 2,
    borderColor: C.line,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    backgroundColor: C.surface,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
