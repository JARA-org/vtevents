import React, { createContext, useContext, useState } from "react";
import type { GobblerTurn } from "./AskGobbler";

const ChatContext = createContext<{
  owner: string | null; turns: GobblerTurn[];
  update: (owner: string, turns: GobblerTurn[]) => void; clear: () => void;
} | null>(null);
/** Ephemeral display state, never persisted. The backend still owns identity and context. */
export function GobblerChatProvider({ children }: { children: React.ReactNode }) {
  const [chat, setChat] = useState<{ owner: string | null; turns: GobblerTurn[] }>({ owner: null, turns: [] });
  return <ChatContext.Provider value={{ ...chat,
    update: (owner, turns) => setChat({ owner, turns }), clear: () => setChat({ owner: null, turns: [] }),
  }}>{children}</ChatContext.Provider>;
}
export function useGobblerChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("GobblerChatProvider is required");
  return context;
}
