import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import type { AssistantReply, Profile } from "@gobbler/shared";
import { backend } from "../services/backend";
import { Button, Gobbler } from "./ui";
import { C, font } from "./theme";

export interface GobblerTurn { question: string; reply: AssistantReply }
/** UI and transient history only. Account data, model calls, filters and writes live on the backend. */
export function AskGobbler({ profile, turns, onTurns, onDiscover, onSaved, onSettings }: {
  profile: Profile; turns: GobblerTurn[]; onTurns: (turns: GobblerTurn[]) => void;
  onDiscover: () => void; onSaved: () => void; onSettings: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [memoryNotice, setMemoryNotice] = useState("");
  const active = useRef(true), pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const send = async (question: string, forceDiscovery = false) => {
    if (pending.current || !question.trim()) return;
    pending.current = true; setBusy(true); setError(""); setMemoryNotice("");
    try {
      const reply = await backend.chatAssistant({ query: question.trim(), forceDiscovery,
        history: turns.slice(-6).flatMap(turn => [
          { role: "user" as const, text: turn.question },
          { role: "assistant" as const, text: turn.reply.answer, eventIds: turn.reply.recommendations.map(r => r.event.id) },
        ]),
      });
      if (active.current) { onTurns([...turns.slice(-19), { question: question.trim(), reply }]); setQuery(""); }
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : "Chat is unavailable. Open Discover to browse events.");
    } finally { pending.current = false; if (active.current) setBusy(false); }
  };
  const latest = turns.at(-1)?.reply;
  const proposal = latest?.memoryProposal;
  const dismissProposal = () => onTurns(turns.map((turn, index) => index === turns.length - 1
    ? { ...turn, reply: { ...turn.reply, memoryProposal: undefined } } : turn));
  const remember = async () => {
    if (!proposal || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await backend.confirmAssistantMemory({ token: proposal.token, confirmation: true });
      if (active.current) { dismissProposal(); setMemoryNotice("Preference remembered. You can edit or remove it in Settings."); }
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : "The preference could not be saved."); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  };
  return <View style={styles.panel}>
    <View style={{ alignItems: "center", gap: 10 }}>
      <Gobbler size={90} />
      <Text accessibilityRole="header" style={styles.title}>Ask Gobbler</Text>
      <Text style={styles.body}>Find something you’ll enjoy, explore your saved events, or get help with MyGobbler.</Text>
    </View>
    <Text style={styles.meta}>This chat stays while you move between pages. Refresh, sign out, or start a new chat to clear it. Gobbler uses the last six exchanges for context. Only preferences you confirm are remembered.</Text>
    {!!turns.length && <Button label="New chat" secondary disabled={busy} onPress={() => { onTurns([]); setError(""); setMemoryNotice(""); setQuery(""); }} />}
    {turns.map((turn, i) => <View key={i} style={{ gap: 12 }}>
      <View style={styles.question}><Text style={styles.label}>You</Text><Text style={styles.body}>{turn.question}</Text></View>
      <View style={{ gap: 8 }}><Text style={styles.label}>Gobbler</Text><Text selectable style={styles.body}>{turn.reply.answer}</Text>
        <Text style={styles.meta}>{turn.reply.notice}</Text></View>
    </View>)}
    {!!proposal && <View style={styles.question}>
      <Text style={styles.label}>Remember this preference?</Text>
      <Text style={styles.body}>{proposal.text}</Text>
      <Text style={styles.meta}>Saved only when you confirm. Future chats can use it while Gemini is enabled.</Text>
      <View style={styles.row}><Button label="Remember this" disabled={busy} onPress={() => void remember()} />
        <Button label="Not now" secondary disabled={busy} onPress={dismissProposal} /></View>
    </View>}
    {!!memoryNotice && <Text accessibilityLiveRegion="polite" style={styles.body}>{memoryNotice}</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
    <Text style={styles.label}>Your message</Text>
    <TextInput accessibilityLabel="Ask Gobbler" multiline maxLength={1000} value={query}
      onChangeText={setQuery} placeholder="What would I enjoy based on my saved events?"
      placeholderTextColor={C.muted} style={styles.input} editable={!busy} />
    <Button label={busy ? "Working…" : "Ask Gobbler"} loading={busy} disabled={!query.trim() || busy} onPress={() => void send(query)} />
    <Text style={styles.meta}>{profile.aiEnabled && profile.assistantConsentVersion === 1
      ? "Gemini uses this chat, your interests, relevant saved events and confirmed preferences."
      : "Personalized chat is optional. Enable Gemini in Settings; event buttons work without it."}</Text>
    <Text style={styles.label}>Explore current listings</Text>
    <Text style={styles.meta}>These filters work without Gemini, including when its free allowance is used up.</Text>
    <View style={styles.row}>{["Friday after 5", "Weekend outdoors", "Arts & music"].map(label =>
      <Button key={label} label={label} secondary disabled={busy} onPress={() => void send(label, true)} />)}</View>
    <View style={styles.row}>
      <Button label="Discover events" secondary onPress={onDiscover} />
      <Button label="Saved events" secondary onPress={onSaved} />
      <Button label="Preferences" secondary onPress={onSettings} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  panel: { width: "100%", maxWidth: 800, alignSelf: "center", gap: 20, padding: 22, backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: C.line },
  title: { fontFamily: font, fontSize: 32, fontWeight: "800", color: C.burgundy },
  body: { fontFamily: font, fontSize: 16, lineHeight: 25, color: C.burgundy },
  meta: { fontFamily: font, fontSize: 13, lineHeight: 20, color: C.muted },
  label: { fontFamily: font, fontSize: 15, fontWeight: "700", color: C.burgundy },
  question: { padding: 16, borderRadius: 14, backgroundColor: "#F7F2EB", gap: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  input: { fontFamily: font, fontSize: 16, lineHeight: 24, minHeight: 92, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, color: C.burgundy },
});
