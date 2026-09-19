import React, { useId, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable as NativePressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { PressableProps, TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, font } from "./theme";

/** UI-only press feedback. No persistence, permissions, network or domain effects. */
export function Pressable({ style, disabled, ...props }: PressableProps) {
  return (
    <NativePressable
      {...props}
      disabled={disabled}
      accessibilityState={{ ...props.accessibilityState, disabled: !!disabled }}
      style={(state) => [
        { minHeight: 44, justifyContent: "center" },
        typeof style === "function" ? style(state) : style,
        state.pressed &&
          !disabled && { transform: [{ translateY: 3 }], opacity: 0.9 },
        disabled && { opacity: 0.5 },
      ]}
    />
  );
}

export function Button({
  label,
  onPress,
  secondary = false,
  gold = false,
  disabled = false,
  loading = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  gold?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const foreground = secondary || gold ? C.burgundy : "#FFFFFF";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        u.button,
        secondary && u.secondary,
        gold && u.gold,
        pressed && !disabled && !loading && { boxShadow: "0 0 0 transparent" },
      ]}
    >
      {icon && (
        <View style={{ width: 20, height: 20 }}>
          {loading ? (
            <ActivityIndicator size="small" color={foreground} />
          ) : (
            <Ionicons
              accessible={false}
              name={icon}
              size={20}
              color={foreground}
            />
          )}
        </View>
      )}
      <Text
        style={[
          u.buttonText,
          { color: foreground },
          loading && !icon && { opacity: 0 },
        ]}
      >
        {label}
      </Text>
      {loading && !icon && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ActivityIndicator
            style={{ flex: 1 }}
            size="small"
            color={foreground}
          />
        </View>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        u.chip,
        active && u.activeChip,
        pressed && { boxShadow: "0 0 0 transparent" },
      ]}
    >
      <Text style={[u.chipText, active && { color: C.maroon }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  secure = false,
  autoComplete,
  inputMode,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChange: (x: string) => void;
  placeholder?: string;
  secure?: boolean;
  autoComplete?: TextInputProps["autoComplete"];
  inputMode?: TextInputProps["inputMode"];
  onSubmitEditing?: () => void;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      {Platform.OS === "web" ? (
        React.createElement(
          "label",
          {
            htmlFor: id,
            style: {
              fontFamily: font,
              fontSize: 14,
              fontWeight: 800,
              color: C.burgundy,
            },
          },
          label,
        )
      ) : (
        <Text style={u.label}>{label}</Text>
      )}
      <TextInput
        nativeID={id}
        accessibilityLabel={label}
        style={[u.input, focused && { borderColor: C.burgundy }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoComplete={autoComplete}
        inputMode={inputMode}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

const mascot = require("../assets/logo.png");
const icon = require("../assets/icon.png");
export function Gobbler({
  size = 64,
  head = false,
  decorative = false,
}: {
  size?: number;
  head?: boolean;
  decorative?: boolean;
}) {
  return (
    <Image
      source={head ? icon : mascot}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : "My Gobbler turkey mascot"}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

const u = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: C.maroon,
    paddingHorizontal: 24,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    boxShadow: "0 4px 0 #3E0020",
    marginBottom: 4,
  },
  secondary: {
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: C.line,
    boxShadow: "0 4px 0 #D5C4B8",
  },
  gold: { backgroundColor: C.gold, boxShadow: "0 4px 0 #D58A00" },
  buttonText: {
    fontFamily: font,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.15,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.line,
    backgroundColor: "white",
    boxShadow: "0 3px 0 #E7D8CD",
    marginBottom: 4,
  },
  activeChip: {
    backgroundColor: C.pink,
    borderColor: C.maroon,
    boxShadow: "0 3px 0 #630031",
  },
  chipText: {
    fontFamily: font,
    fontSize: 14,
    fontWeight: "800",
    color: C.muted,
  },
  input: {
    fontFamily: font,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.paper,
    minHeight: 52,
  },
  label: {
    fontFamily: font,
    fontSize: 14,
    fontWeight: "800",
    color: C.burgundy,
  },
});
