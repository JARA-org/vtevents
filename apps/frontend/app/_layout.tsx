import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ErrorProvider } from "../components/ErrorModal";
export default function Layout() {
  return (
    <ErrorProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </ErrorProvider>
  );
}
