import { Platform } from "react-native";

export const C = {
  ink: "#020101",
  muted: "#6B5B5B",
  maroon: "#630031",
  burgundy: "#5B0612",
  orange: "#CF4420",
  gold: "#FCBD1C",
  face: "#AF3737",
  red: "#C40216",
  cream: "#FFF0D2",
  paper: "#FFF8F2",
  surface: "#FFFFFF",
  line: "#E7D8CD",
  green: "#2E7D32",
  pink: "#F9E9E8",
};
export const font =
  Platform.OS === "web" ? "Nunito, system-ui, sans-serif" : undefined;
