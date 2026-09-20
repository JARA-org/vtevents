import React, { useState } from "react";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, Field, Gobbler, Pressable } from "./ui";
import { C, font } from "./theme";

/** Controlled form drafts only. The caller submits credentials through the backend client. */
export function SignInCard({
  signUp,
  name,
  email,
  password,
  loading,
  setName,
  setEmail,
  setPassword,
  onToggle,
  onSubmit,
}: {
  signUp: boolean;
  name: string;
  email: string;
  password: string;
  loading: boolean;
  setName: (v: string) => void;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  onToggle: () => void;
  onSubmit: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <View style={a.card}>
      <View style={{ alignItems: "center", gap: 12 }}>
        <Gobbler head size={104} />
        <Text style={a.eyebrow}>
          {signUp ? "YOUR NEXT CHAPTER STARTS HERE" : "GOOD TO SEE YOU, HOKIE"}
        </Text>
        <Text accessibilityRole="header" style={a.title}>
          {signUp ? "Make campus yours." : "Welcome back to\nMy Gobbler"}
        </Text>
        <Text style={a.copy}>
          {signUp
            ? "Find your people. Save your plans."
            : "Sign in to keep gobbling."}
        </Text>
      </View>
      <View style={{ gap: 20, marginTop: 8 }}>
        {!signUp && (
          <Link href="/recover" style={{ color: C.maroon, paddingVertical: 8 }}>
            Forgot your password?
          </Link>
        )}
        {!signUp && (
          <Link
            href="/recover?verify=true"
            style={{ color: C.maroon, paddingVertical: 8 }}
          >
            Verify your email address
          </Link>
        )}
        {signUp && (
          <Field
            label="Your name"
            value={name}
            onChange={setName}
            autoComplete="name"
            placeholder="What should we call you?"
          />
        )}
        <Field
          label="Email address"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          onSubmitEditing={onSubmit}
        />
        <View style={{ gap: 6 }}>
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            secure={!showPassword}
            autoComplete={signUp ? "new-password" : "current-password"}
            onSubmitEditing={onSubmit}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text style={[a.small, { flex: 1 }]}>
              {signUp
                ? "Use at least 12 characters."
                : "Your plans are waiting for you."}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showPassword ? "Hide password" : "Show password"
              }
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={a.link}>{showPassword ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
        </View>
        <Button
          label={signUp ? "Create my account" : "Sign in"}
          loading={loading}
          icon="arrow-forward-outline"
          onPress={onSubmit}
        />
      </View>
      <View style={a.divider} />
      <Text style={[a.copy, { fontSize: 14 }]}>
        {signUp ? "Already part of the flock?" : "New around here?"}
      </Text>
      <Button
        secondary
        label={signUp ? "I already have an account" : "Create an account"}
        onPress={onToggle}
      />
    </View>
  );
}
const a = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 20,
    padding: 28,
    gap: 16,
    marginVertical: 24,
    boxShadow: "0 6px 0 #E7D8CD",
  },
  title: {
    fontFamily: font,
    fontSize: 29,
    fontWeight: "800",
    lineHeight: 35,
    color: C.burgundy,
    textAlign: "center",
  },
  copy: {
    fontFamily: font,
    fontSize: 16,
    color: C.muted,
    textAlign: "center",
    lineHeight: 24,
  },
  eyebrow: {
    fontFamily: font,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
    color: C.maroon,
  },
  small: { fontFamily: font, fontSize: 12, lineHeight: 18, color: C.muted },
  link: { fontFamily: font, fontSize: 13, fontWeight: "800", color: C.maroon },
  divider: { height: 1, backgroundColor: C.line, marginTop: 8 },
});
