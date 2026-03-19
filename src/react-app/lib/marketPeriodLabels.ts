export type MarketPeriodLabels = {
  short: string;
  section: string;
  lines: string;
};

export function getMarketPeriodLabels(sport: string | null | undefined): MarketPeriodLabels {
  const normalized = String(sport || "").trim().toUpperCase();

  if (normalized === "NHL") {
    return {
      short: "1P",
      section: "First Period",
      lines: "1P Lines",
    };
  }

  if (normalized === "MLB") {
    return {
      short: "F5",
      section: "First 5 Innings",
      lines: "F5 Lines",
    };
  }

  // Basketball, soccer, and fallback markets use first-half terminology.
  return {
    short: "1H",
    section: "First Half",
    lines: "1H Lines",
  };
}
