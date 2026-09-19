import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Gobbler } from "./ui";
import { C, font } from "./theme";

type ErrorDetails = { message: string; title?: string };
const ErrorContext = createContext<(error: string | ErrorDetails) => void>(
  () => {},
);
export const useError = () => useContext(ErrorContext);

/** UI-only error state. Closing never retries a write or changes account data. */
export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<ErrorDetails | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const report = useCallback((value: string | ErrorDetails) => {
    // Capture the initiating control before an async action disables it.
    if (Platform.OS === "web" && (value === "" || !returnFocus.current)) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    setError(
      value === ""
        ? null
        : typeof value === "string"
          ? { message: value }
          : value,
    );
  }, []);
  return (
    <ErrorContext.Provider value={report}>
      {children}
      <ErrorModal
        error={error}
        returnFocus={returnFocus}
        onClose={() => setError(null)}
      />
    </ErrorContext.Provider>
  );
}

/** Native HTML dialog supplies focus trapping, modal semantics, Esc and focus return on web. */
export function ErrorModal({
  error,
  onClose,
  returnFocus,
}: {
  error: ErrorDetails | null;
  onClose: () => void;
  returnFocus?: React.RefObject<HTMLElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !dialog.current) return;
    if (error) {
      trigger.current = returnFocus?.current?.isConnected
        ? returnFocus.current
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (!dialog.current.open) dialog.current.showModal();
    } else if (dialog.current.open) {
      dialog.current.close();
      trigger.current?.focus();
    }
  }, [error]);
  const content = (
    <View style={styles.content}>
      <View style={styles.icon}>
        <Gobbler head size={62} decorative />
      </View>
      <Text
        nativeID="gobbler-error-title"
        accessibilityRole="header"
        aria-level={2}
        style={styles.title}
      >
        {error?.title || "Let's try that again"}
      </Text>
      <Text nativeID="gobbler-error-message" style={styles.message}>
        {error?.message}
      </Text>
      <Text style={styles.hint}>
        Head back to your page and give it another go when you’re ready.
      </Text>
      <Button
        label="Back to my page"
        icon="arrow-back-outline"
        onPress={onClose}
      />
      <Button secondary label="Dismiss" onPress={onClose} />
    </View>
  );
  if (Platform.OS === "web")
    return React.createElement(
      "dialog",
      {
        ref: dialog,
        className: "gobbler-error-modal",
        role: "alertdialog",
        "aria-modal": true,
        "aria-labelledby": "gobbler-error-title",
        "aria-describedby": "gobbler-error-message",
        onKeyDown: (event: React.KeyboardEvent<HTMLDialogElement>) => {
          if (event.key !== "Tab") return;
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button, a[href], input, [tabindex="0"]',
            ),
          ).filter(
            (el) =>
              el.getAttribute("aria-disabled") !== "true" &&
              el.getClientRects().length,
          );
          const first = items[0],
            last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        },
        onCancel: (event: React.SyntheticEvent) => {
          event.preventDefault();
          onClose();
        },
        onClick: (event: React.MouseEvent) => {
          if (event.target === event.currentTarget) onClose();
        },
      },
      content,
    );
  return (
    <Modal
      visible={!!error}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Dismiss error"
        />
        <View accessibilityViewIsModal style={styles.nativeCard}>
          {content}
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  content: { padding: 28, gap: 16 },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: C.pink,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontFamily: font,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: C.burgundy,
  },
  message: { fontFamily: font, fontSize: 16, lineHeight: 25, color: C.ink },
  hint: { fontFamily: font, fontSize: 13, lineHeight: 20, color: C.muted },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,1,1,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  nativeCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 20,
    backgroundColor: "white",
  },
});
