// Add Expo single-page export metadata without changing routing or server behavior.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const path = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/frontend/dist/index.html",
);
let html = readFileSync(path, "utf8");
html = html.replace(/<title>.*?<\/title>/s, "<title>My Gobbler</title>");
html = html.replace(/<html(?:\s[^>]*)?>/, '<html lang="en">');
html = html.replace(/<link[^>]*rel="(?:shortcut )?icon"[^>]*>/g, "");
html = html.replace(
  "</head>",
  `<meta name="description" content="Find your people at Virginia Tech. Discover campus events, save your favorites, and make room for a good day with My Gobbler." />
<meta name="theme-color" content="#5B0612" />
<meta property="og:title" content="My Gobbler" />
<meta property="og:description" content="Your campus. Your kind of day." />
<meta property="og:image" content="/og-image.png" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="preload" as="font" href="/fonts/Nunito.ttf" type="font/ttf" crossorigin />
<link rel="stylesheet" href="/theme.css" />
</head>`,
);
writeFileSync(path, html);
console.log("My Gobbler metadata and local theme installed.");
