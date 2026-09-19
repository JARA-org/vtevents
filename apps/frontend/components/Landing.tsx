import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Gobbler } from "./ui";
import { C, font } from "./theme";

/** Public product introduction. No event fixtures or client-side recommendations. */
export function Landing({
  signedIn,
  onStart,
  onSignIn,
}: {
  signedIn: boolean;
  onStart: () => void;
  onSignIn: () => void;
}) {
  const { width } = useWindowDimensions();
  const mobile = width < 800;
  return (
    <View style={{ gap: mobile ? 40 : 56 }}>
      <View
        style={[
          l.hero,
          mobile && { flexDirection: "column", gap: 36, paddingTop: 16 },
        ]}
      >
        <View style={{ flex: 1, gap: 24, width: "100%" }}>
          <View style={l.eyebrow}>
            <View style={l.dot} />
            <Text style={l.eyebrowText}>YOUR VIRGINIA TECH SIDEKICK</Text>
          </View>
          <Text
            accessibilityRole="header"
            style={[
              l.title,
              mobile && { fontSize: 44, lineHeight: 49, letterSpacing: -1.5 },
            ]}
          >
            Don't be left out.{" "}
            <Text style={{ color: C.orange }}>Let your gobbler help you out.</Text>
          </Text>
          <Text style={l.description}>
            The club you haven’t found. The game you don’t want to miss. The
            people who get you.
          </Text>
          <Text style={l.description}>
            Find your corner of campus with My Gobbler.
          </Text>
          <View style={[l.actions, mobile && { alignItems: "stretch" }]}>
            <Button
              label={signedIn ? "Explore my campus" : "Find my people"}
              icon="compass-outline"
              onPress={onStart}
            />
            {!signedIn && (
              <Button
                secondary
                label="I already have an account"
                onPress={onSignIn}
              />
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons
              accessible={false}
              name="heart-outline"
              size={17}
              color={C.maroon}
            />
            <Text style={l.note}>Student-built. Full of Hokie spirit.</Text>
          </View>
        </View>
        <View style={[l.art, mobile && { width: "100%", height: 330 }]}>
          <View style={[l.circle, mobile && { width: 270, height: 270 }]} />
          <View style={[l.hello, { top: mobile ? 0 : 8 }]}>
            <Text style={l.helloText}>Hey, Hokie. Let’s go!</Text>
          </View>
          <View style={{ transform: [{ rotate: "-5deg" }], marginTop: 28 }}>
            <Gobbler size={mobile ? 292 : 365} />
          </View>
          <View
            style={[
              l.sticker,
              {
                bottom: mobile ? 4 : 24,
                right: 0,
                transform: [{ rotate: "5deg" }],
              },
            ]}
          >
            <Ionicons
              accessible={false}
              name="location"
              size={20}
              color={C.maroon}
            />
            <Text style={l.stickerText}>Blacksburg, VA</Text>
          </View>
          <View style={[l.spark, { left: 5, top: "42%" }]}>
            <Ionicons
              accessible={false}
              name="sparkles"
              size={27}
              color={C.orange}
            />
          </View>
        </View>
      </View>

      <View style={l.interestStrip}>
        <Text style={l.stripLabel}>A WHOLE CAMPUS OF POSSIBILITIES</Text>
        <View style={l.interests}>
          {(
            [
              ["musical-notes-outline", "Music & arts"],
              ["american-football-outline", "Game days"],
              ["leaf-outline", "Fresh air"],
              ["people-outline", "Your people"],
              ["pizza-outline", "Good times"],
            ] as const
          ).map(([icon, label]) => (
            <View key={label} style={l.interest}>
              <Ionicons
                accessible={false}
                name={icon}
                size={23}
                color={C.maroon}
              />
              <Text style={l.interestText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: 32 }}>
        <View style={{ gap: 8, alignItems: "center" }}>
          <Text style={l.eyebrowText}>YOUR GOBBLER. YOUR NEXT DISCOVERY.</Text>
          <Text
            accessibilityRole="header"
            aria-level={2}
            style={[l.sectionTitle, { textAlign: "center" }]}
          >
            Your next good day starts here.
          </Text>
        </View>
        <View style={[l.steps, mobile && { flexDirection: "column" }]}>
          {(
            [
              [
                "01",
                "heart-outline",
                "Start with you.",
                "Pick the things you love. We’ll help you find more of them.",
                C.pink,
              ],
              [
                "02",
                "compass-outline",
                "Find your thing.",
                "Explore campus events, from club meetups to game day.",
                C.cream,
              ],
              [
                "03",
                "calendar-outline",
                "Make it a plan.",
                "Save a favorite. Check your schedule. Go make a memory.",
                "#EAF0E5",
              ],
            ] as const
          ).map(([number, icon, title, copy, color]) => (
            <View key={number} style={l.step}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={[l.stepIcon, { backgroundColor: color }]}>
                  <Ionicons
                    accessible={false}
                    name={icon}
                    size={27}
                    color={C.maroon}
                  />
                </View>
                <Text style={l.number}>{number}</Text>
              </View>
              <Text style={l.stepTitle}>{title}</Text>
              <Text style={l.stepCopy}>{copy}</Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          l.lastCall,
          mobile && {
            flexDirection: "column",
            padding: 24,
            alignItems: "flex-start",
          },
        ]}
      >
        <Gobbler head size={78} decorative />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={l.stepTitle}>Campus is better with company.</Text>
          <Text style={l.stepCopy}>Your next “glad I went” is out there.</Text>
        </View>
        <Button
          gold
          label={signedIn ? "Let’s explore" : "Meet your Gobbler"}
          icon="arrow-forward-outline"
          onPress={onStart}
        />
      </View>
      <Text style={[l.note, { textAlign: "center" }]}>
        Discover listings from GobblerConnect and VT Sports. Connect your
        calendar when you’re ready.
      </Text>
    </View>
  );
}
const l = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 36,
    paddingVertical: 36,
  },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.orange },
  eyebrowText: {
    fontFamily: font,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: "800",
    color: C.maroon,
  },
  title: {
    fontFamily: font,
    fontSize: 62,
    lineHeight: 67,
    letterSpacing: -2,
    fontWeight: "900",
    color: C.burgundy,
  },
  description: {
    fontFamily: font,
    fontSize: 18,
    lineHeight: 29,
    color: C.muted,
    maxWidth: 455,
  },
  actions: { gap: 12, alignItems: "flex-start", marginTop: 4 },
  note: { fontFamily: font, fontSize: 13, lineHeight: 21, color: C.muted },
  art: {
    width: "43%",
    height: 420,
    justifyContent: "center",
    alignItems: "center",
  },
  circle: {
    position: "absolute",
    width: 350,
    height: 350,
    backgroundColor: "#FFE8AD",
    borderRadius: 180,
  },
  hello: {
    position: "absolute",
    zIndex: 2,
    left: 20,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 22,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: C.burgundy,
    boxShadow: "0 4px 0 #E7D8CD",
    transform: [{ rotate: "-6deg" }],
  },
  helloText: {
    fontFamily: font,
    fontSize: 18,
    fontWeight: "800",
    color: C.burgundy,
  },
  sticker: {
    position: "absolute",
    zIndex: 2,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 12,
    padding: 12,
    boxShadow: "0 4px 0 #E7D8CD",
  },
  stickerText: {
    fontFamily: font,
    fontSize: 13,
    fontWeight: "800",
    color: C.burgundy,
  },
  spark: { position: "absolute" },
  interestStrip: {
    paddingVertical: 28,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: C.line,
    gap: 20,
  },
  stripLabel: {
    fontFamily: font,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: C.muted,
    textAlign: "center",
  },
  interests: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 24,
  },
  interest: { flexDirection: "row", alignItems: "center", gap: 10 },
  interestText: {
    fontFamily: font,
    fontWeight: "800",
    fontSize: 15,
    color: C.burgundy,
  },
  sectionTitle: {
    fontFamily: font,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "800",
    color: C.burgundy,
    letterSpacing: -0.8,
  },
  steps: { flexDirection: "row", gap: 24 },
  step: {
    flex: 1,
    padding: 24,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 20,
    gap: 16,
    backgroundColor: "white",
    boxShadow: "0 4px 0 #E7D8CD",
  },
  stepIcon: {
    height: 56,
    width: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  number: {
    fontFamily: font,
    fontSize: 30,
    fontWeight: "900",
    color: "#AE8D7F",
  },
  stepTitle: {
    fontFamily: font,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "800",
    color: C.burgundy,
  },
  stepCopy: { fontFamily: font, fontSize: 16, lineHeight: 25, color: C.muted },
  lastCall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    borderRadius: 24,
    padding: 32,
    backgroundColor: C.cream,
  },
});
