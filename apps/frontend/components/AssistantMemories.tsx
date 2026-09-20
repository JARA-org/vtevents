import React, { useEffect, useState } from "react";
import { Text, View, TextInput } from "react-native";
import type { AssistantMemory } from "@gobbler/shared";
import { backend } from "../services/backend";
import { Button } from "./ui";
import { C, font } from "./theme";

/** Session-scoped facts are authoritative backend results; edits remain drafts until confirmed. */
export function AssistantMemories() {
  const [memories, setMemories] = useState<AssistantMemory[]>([]);
  const [editing, setEditing] = useState<AssistantMemory | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Loading remembered preferences…");
  useEffect(() => {
    let active = true;
    backend.assistantMemories(undefined).then(result => { if (active) { setMemories(result.memories); setStatus(""); } })
      .catch(() => { if (active) setStatus("Remembered preferences could not be loaded. Reopen Settings to try again."); });
    return () => { active = false; };
  }, []);
  const change = async (operation: () => Promise<{ memories: AssistantMemory[] }>) => {
    setBusy(true); setStatus("");
    try { const result = await operation(); setMemories(result.memories); setEditing(null); setStatus("Remembered preferences updated."); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Could not update preferences."); }
    finally { setBusy(false); }
  };
  const body = { fontFamily: font, fontSize: 15, lineHeight: 23, color: C.burgundy };
  return <View style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={[body, { fontSize: 20, fontWeight: "700" }]}>What Gobbler remembers</Text>
    <Text style={body}>Only preferences you explicitly confirm are stored. They personalize Gemini chats; your interest categories are managed above.</Text>
    {!!status && <Text accessibilityLiveRegion="polite" style={body}>{status}</Text>}
    {!status && !memories.length && <Text style={body}>No remembered preferences yet.</Text>}
    {memories.map(memory => <View key={memory.id} style={{ gap: 10 }}>
      <Text style={body}>{memory.text}</Text>
      {editing?.id === memory.id ? <>
        <TextInput accessibilityLabel="Edit remembered preference" value={text} onChangeText={setText} maxLength={240} multiline style={[body, { borderWidth: 1, borderColor: C.line, padding: 12, borderRadius: 10 }]} />
        <Button label="Confirm preference change" disabled={busy || !text.trim()} onPress={() => void change(() => backend.editAssistantMemory({ id: memory.id, text, expectedText: memory.text, confirmation: true }))} />
        <Button label="Cancel edit" secondary disabled={busy} onPress={() => setEditing(null)} />
      </> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Button label="Edit preference" secondary disabled={busy} onPress={() => { setEditing(memory); setText(memory.text); }} />
        <Button label="Forget preference" secondary disabled={busy} onPress={() => void change(() => backend.deleteAssistantMemory({ id: memory.id }))} />
      </View>}
    </View>)}
  </View>;
}
