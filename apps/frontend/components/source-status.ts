/** Display labels only; source health remains authoritative backend data. */
export function sourceStatusText(status: string): string {
  switch (status) {
    case "unchanged":
    case "live":
      return "Up to date";
    case "snapshot":
    case "cached":
      return "Listings available";
    case "partial":
      return "More listings on the way";
    default:
      return "Coming soon";
  }
}

const labels: Record<string, string> = {
  gobblerconnect: "GobblerConnect",
  "vt-events": "Virginia Tech Events",
  "vt-sports": "HokieSports",
  registrar: "Academic Deadlines",
  libraries: "University Libraries",
  arts: "Center for the Arts",
  recreation: "Recreational Sports",
  career: "Career Events",
  dining: "Dining Events",
  housing: "Housing Dates",
  "financial-aid": "Financial Aid Deadlines",
  bursar: "Payment Deadlines",
  cranwell: "Cranwell International Center",
  research: "Research Events",
  "undergraduate-research": "Undergraduate Research",
  graduate: "Graduate School Events",
};
/** Presentation names for source IDs; never selects or filters source data. */
export function sourceLabel(id: string): string {
  return labels[id] ?? id.replace(/-/g, " ");
}
