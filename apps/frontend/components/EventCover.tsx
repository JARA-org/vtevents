import React, { useState } from "react";
import { Image } from "react-native";
import type { CampusEvent } from "@gobbler/shared";
import { eventCardPhotos } from "./event-presentation";

/** Renders source media, or bundled decorative imagery when absent/unloadable. */
export function EventCover({ event }: { event: CampusEvent }) {
  const { cover, fallback } = eventCardPhotos(event);
  const [failedUrl, setFailedUrl] = useState<string>();
  const photo = failedUrl === cover.url ? fallback : cover;
  return <Image
    source={{ uri: photo.url }}
    accessibilityLabel={photo.alt || event.title}
    resizeMode="cover"
    onError={photo.url !== fallback.url ? () => setFailedUrl(cover.url) : undefined}
    style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
  />;
}
