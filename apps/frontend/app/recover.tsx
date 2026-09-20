import React, { useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { View, Text, ScrollView } from "react-native";
import { backend } from "../services/backend";
import { Button, Field, Gobbler } from "../components/ui";
import { C } from "../components/theme";

/** UI drafts and server-result presentation only. Token validation, account
 * lookup, password policy and mail delivery all belong to the backend. */
export default function Recover() {
  const params = useLocalSearchParams<{
    token?: string;
    error?: string;
    verify?: string;
  }>();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [ready, setReady] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    backend
      .accountEmail(undefined)
      .then((r) => setReady(r.available))
      .catch(() => {
        setReady(false);
        setError("Account services are unavailable. Please try again later.");
      });
  }, []);
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: C.cream,
        padding: 24,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 460,
          gap: 20,
          backgroundColor: "white",
          padding: 28,
          borderRadius: 24,
        }}
      >
        <Gobbler head size={80} />
        <Text
          accessibilityRole="header"
          style={{ fontSize: 28, fontWeight: "700", color: C.maroon }}
        >
          {params.verify
            ? "Verify your email"
            : token
              ? "Choose a new password"
              : "Forgot your password?"}
        </Text>
        <Text>Keep your campus plans connected to you.</Text>
        {ready === null && (
          <Text accessibilityLiveRegion="polite">
            Checking account services…
          </Text>
        )}
        {ready === false && (
          <Text>
            Email delivery is not available yet. Your existing password still
            works. Please try again later.
          </Text>
        )}
        {!!params.error && (
          <Text accessibilityRole="alert">
            This link is invalid or expired. Request a new link below.
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: C.maroon }}>
            {error}
          </Text>
        )}
        {!!message && <Text accessibilityLiveRegion="polite">{message}</Text>}
        {!done && ready && (
          <>
            {token ? (
              <Field
                label="New password (at least 12 characters)"
                value={password}
                onChange={setPassword}
                secure
                autoComplete="new-password"
              />
            ) : (
              <Field
                label="Email address"
                value={email}
                onChange={setEmail}
                inputMode="email"
                autoComplete="email"
              />
            )}
            <Button
              label={token ? "Save new password" : "Send email link"}
              loading={busy}
              onPress={async () => {
                setBusy(true);
                setError("");
                try {
                  if (token) {
                    await backend.resetPassword({
                      token,
                      newPassword: password,
                    });
                    setPassword("");
                    setMessage(
                      "Password updated. Sign in with your new password.",
                    );
                  } else if (params.verify) {
                    await backend.sendVerificationEmail({
                      email,
                      callbackURL: "/?page=auth",
                    });
                    setMessage(
                      "Check your inbox for the verification link. It expires in one hour.",
                    );
                  } else {
                    await backend.requestPasswordReset({
                      email,
                      redirectTo: "/recover",
                    });
                    setMessage(
                      "If an account matches that address, a reset link will arrive shortly. Check your spam folder too. The link expires in one hour.",
                    );
                  }
                  setDone(true);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Please try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        )}
        <Link
          href="/?page=auth"
          style={{ color: C.maroon, paddingVertical: 12 }}
        >
          Back to sign in
        </Link>
      </View>
    </ScrollView>
  );
}
