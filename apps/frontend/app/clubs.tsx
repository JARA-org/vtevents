import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Switch,
  Linking,
} from "react-native";
import { router } from "expo-router";
import { Button } from "../components/ui";
import { C, font } from "../components/theme";
import type {
  ManagedClub,
  ClubWorkspace,
  ClubEventEdit,
} from "@gobbler/shared";
import { backend } from "../services/backend";

export default function ClubsPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [personName, setPersonName] = useState("");
  const [name, setName] = useState("");
  const [clubs, setClubs] = useState<ManagedClub[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [workspace, setWorkspace] = useState<ClubWorkspace | null>(null);
  const [edit, setEdit] = useState<ClubEventEdit | null>(null);
  const [ticket, setTicket] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(String(Date.now()) + "-club-create");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        "discord",
      );
      if (token) {
        setTicket(token);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
    backend
      .myClubs()
      .then((result) => {
        setClubs(result.clubs);
        setCanCreate(result.canCreate === true);
        setSignedIn(true);
      })
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "Account services are unavailable. Please try again.",
        ),
      )
      .finally(() => setReady(true));
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const button = (label: string, action: () => void) => (
    <Button label={label} disabled={busy} onPress={action} />
  );
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Button secondary label="Back to Campus Events" onPress={() => router.push("/?page=discover")} />
        <Text style={styles.heading}>Your club workspace</Text>
        <Text>
          Sign in with your website account to create a club and access its
          events.
        </Text>
        {ticket && (
          <Text style={styles.notice}>
            Discord setup: creating or selecting a club below will automatically
            link the server that sent you here. This private link expires after
            ten minutes. Finish on this page before refreshing.
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {!ready ? (
          <Text>Loading…</Text>
        ) : !signedIn ? (
          <View style={styles.group}>
            <Text style={styles.title}>
              {register ? "Create your website account" : "Sign in"}
            </Text>
            {register && (
              <TextInput
                accessibilityLabel="Your name"
                placeholder="Your name"
                value={personName}
                onChangeText={setPersonName}
                style={styles.input}
              />
            )}
            <TextInput
              accessibilityLabel="Email"
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Password"
              placeholder="Password (at least 12 characters)"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
            {button(
              register ? "Create account" : "Sign in",
              () =>
                void run(async () => {
                  if (register)
                    await backend.signUp({ name: personName, email, password });
                  else await backend.signIn({ email, password });
                  setPassword("");
                  const result = await backend.myClubs();
                  setClubs(result.clubs);
                  setCanCreate(result.canCreate === true);
                  setSignedIn(true);
                }),
            )}
            {button(
              register
                ? "Already have an account? Sign in"
                : "Create an account",
              () => setRegister(!register),
            )}
          </View>
        ) : (
          <View style={styles.group}>
            <Text style={styles.title}>Your club</Text>
            {!clubs.length && <Text>You have no club workspaces yet.</Text>}
            {clubs.map((club) => (
              <View key={club.id} style={styles.group}>
                <Text>
                  {club.name}
                  {club.discordGuildId ? " · Discord connected" : ""}
                </Text>
                {button(
                  ticket ? "Select and connect Discord" : "View events",
                  () =>
                    void run(async () => {
                      if (ticket) {
                        await backend.linkClubDiscord({
                          clubId: club.id,
                          discordTicket: ticket,
                        });
                        setTicket(undefined);
                        const refreshed = await backend.myClubs();
                        setClubs(refreshed.clubs);
                        setCanCreate(refreshed.canCreate === true);
                      }
                      setWorkspace(
                        await backend.clubWorkspace({ clubId: club.id }),
                      );
                    }),
                )}
              </View>
            ))}
            {canCreate && (
              <View style={styles.group}>
                <Text style={styles.title}>Create your club workspace</Text>
                <Text>
                  This creates a new identity. Claiming an existing listed club
                  is coming later.
                </Text>
                <TextInput
                  accessibilityLabel="Club name"
                  placeholder="Club name"
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                />
                {button(
                  ticket ? "Create club and connect Discord" : "Create club",
                  () =>
                    void run(async () => {
                      const club = await backend.createClub({
                        name,
                        requestId: requestId.current,
                        discordTicket: ticket,
                      });
                      setTicket(undefined);
                      setName("");
                      requestId.current = String(Date.now()) + "-club-create";
                      const refreshed = await backend.myClubs();
                      setClubs(refreshed.clubs);
                      setCanCreate(refreshed.canCreate === true);
                      setWorkspace(
                        await backend.clubWorkspace({ clubId: club.id }),
                      );
                    }),
                )}
              </View>
            )}
            {button(
              "Sign out",
              () =>
                void run(async () => {
                  await backend.signOut({});
                  setSignedIn(false);
                  setClubs([]);
                  setWorkspace(null);
                  setEdit(null);
                }),
            )}
          </View>
        )}
        {signedIn && workspace && (
          <View style={styles.group}>
            <Text style={styles.title}>{workspace.club.name}: events</Text>
            {workspace.club.discordGuildId && (
              <Text>
                Discord server {workspace.club.discordGuildId} connected. Return
                to Discord to choose channels with /gobbler watch public:true.
              </Text>
            )}
            {!workspace.events.length && (
              <Text>
                No published events are associated with this club yet.
              </Text>
            )}
            {workspace.events.map((event) => (
              <View key={event.id}>
                <Text style={styles.title}>{event.title}</Text>
                <Text>
                  {new Intl.DateTimeFormat("en-US", {timeZone:event.timezone, dateStyle:"medium", ...(event.timeTBD ? {} : {timeStyle:"short" as const})}).format(new Date(event.start))}
                  {event.timeTBD ? " · Time to be confirmed" : event.end ? ` – ${new Intl.DateTimeFormat("en-US", {timeZone:event.timezone,timeStyle:"short"}).format(new Date(event.end))}` : ""} · {event.location || ""}
                </Text>
                {event.onlineUrl && <Text accessibilityRole="link" onPress={() => void Linking.openURL(event.onlineUrl!)} style={{color:C.maroon}}>Watch / join online: {event.onlineUrl}</Text>}
              </View>
            ))}
            <Text>
              Qualifying Discord events publish automatically. You can correct
              them after publication.
            </Text>
            {(workspace.editableEvents || []).map((item) => (
              <View key={item.eventId}>
                {button(`Edit event: ${item.values.title}`, () =>
                  setEdit(item),
                )}
              </View>
            ))}
            {edit && (
              <View style={styles.group}>
                <Text style={styles.title}>Edit published event</Text>
                <Text>
                  Changes appear on the website. Discord messages are not
                  modified.
                </Text>
                <TextInput
                  accessibilityLabel="Event title"
                  placeholder="Event title"
                  style={styles.input}
                  value={edit.values.title}
                  onChangeText={(title) =>
                    setEdit({ ...edit, values: { ...edit.values, title } })
                  }
                />
                <TextInput
                  accessibilityLabel="Event description"
                  placeholder="Description"
                  multiline
                  style={styles.input}
                  value={edit.values.description}
                  onChangeText={(description) =>
                    setEdit({
                      ...edit,
                      values: { ...edit.values, description },
                    })
                  }
                />
                <TextInput
                  accessibilityLabel="Event date"
                  placeholder="YYYY-MM-DD"
                  style={styles.input}
                  value={edit.values.date}
                  onChangeText={(date) =>
                    setEdit({ ...edit, values: { ...edit.values, date } })
                  }
                />
                <TextInput
                  accessibilityLabel="Physical location"
                  placeholder="Physical location (optional for online events)"
                  style={styles.input}
                  value={edit.values.location || ""}
                  onChangeText={(location) =>
                    setEdit({
                      ...edit,
                      values: { ...edit.values, location: location || null },
                    })
                  }
                />
                <TextInput
                  accessibilityLabel="Online link"
                  placeholder="Online link (optional)"
                  autoCapitalize="none"
                  style={styles.input}
                  value={edit.values.onlineUrl || ""}
                  onChangeText={(onlineUrl) =>
                    setEdit({
                      ...edit,
                      values: { ...edit.values, onlineUrl: onlineUrl || null },
                    })
                  }
                />
                <Text>Online attendance available</Text>
                <Switch
                  accessibilityLabel="Online attendance available"
                  value={edit.values.isOnline}
                  onValueChange={(isOnline) =>
                    setEdit({ ...edit, values: { ...edit.values, isOnline } })
                  }
                />
                {button(
                  "Save changes",
                  () =>
                    void run(async () => {
                      await backend.editClubEvent(edit);
                      setEdit(null);
                      setWorkspace(
                        await backend.clubWorkspace({
                          clubId: workspace.club.id,
                        }),
                      );
                    }),
                )}
                {button("Cancel editing", () => setEdit(null))}
              </View>
            )}
            {button(
              "Refresh events",
              () =>
                void run(async () =>
                  setWorkspace(
                    await backend.clubWorkspace({ clubId: workspace.club.id }),
                  ),
                ),
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { padding: 24, backgroundColor: C.cream, flexGrow: 1 },
  card: { width: "100%", maxWidth: 720, alignSelf: "center", gap: 18 },
  heading: { fontFamily: font, fontSize: 30, fontWeight: "700", color: "#6B183B" },
  title: { fontFamily: font, color: C.maroon, fontSize: 20, fontWeight: "600" },
  group: { gap: 12, marginVertical: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#aaa",
    backgroundColor: "white",
    padding: 14,
    borderRadius: 8,
  },
  button: { backgroundColor: "#6B183B", padding: 14, borderRadius: 8 },
  buttonText: { color: "white", fontWeight: "600" },
  notice: { backgroundColor: "#F5E9EC", padding: 14 },
  error: { color: "#a00" },
});
