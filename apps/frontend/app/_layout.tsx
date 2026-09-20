import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GobblerChatProvider } from "../components/GobblerChatState";
import { ErrorProvider } from "../components/ErrorModal";
export default function Layout() {
  return (
    <ErrorProvider><GobblerChatProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </GobblerChatProvider></ErrorProvider>
  );
}
