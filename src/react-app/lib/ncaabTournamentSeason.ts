export type NcaabTournamentPhase = "pre_tournament" | "live_tournament" | "post_tournament";

export type NcaabTournamentState = {
  phase: NcaabTournamentPhase;
  seasonYear: number;
  currentRoundLabel: string;
  showTournamentTakeover: boolean;
  showArchiveEntry: boolean;
  isMarchMadnessActive: boolean;
  isNitActive: boolean;
};

function toEtDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value || "0"),
    month: Number(parts.find((p) => p.type === "month")?.value || "0"),
    day: Number(parts.find((p) => p.type === "day")?.value || "0"),
  };
}

function toEtDayNumber(date: Date): number {
  const parts = toEtDateParts(date);
  return parts.year * 10000 + parts.month * 100 + parts.day;
}

function getRoundLabel(dayNum: number, seasonYear: number): string {
  const y = seasonYear;
  if (dayNum <= y * 10000 + 318) return "First Four";
  if (dayNum <= y * 10000 + 320) return "Round of 64";
  if (dayNum <= y * 10000 + 322) return "Round of 32";
  if (dayNum <= y * 10000 + 329) return "Sweet 16";
  if (dayNum <= y * 10000 + 331) return "Elite Eight";
  if (dayNum <= y * 10000 + 406) return "Final Four";
  return "Championship";
}

export function getNcaabTournamentState(now: Date = new Date()): NcaabTournamentState {
  const et = toEtDateParts(now);
  const seasonYear = et.month <= 6 ? et.year : et.year + 1;
  const dayNum = toEtDayNumber(now);

  const marchMadnessStart = seasonYear * 10000 + 318;
  const marchMadnessEnd = seasonYear * 10000 + 408;
  const nitStart = seasonYear * 10000 + 317;
  const nitEnd = seasonYear * 10000 + 410;
  const archiveStart = seasonYear * 10000 + 409;

  const isMarchMadnessActive = dayNum >= marchMadnessStart && dayNum <= marchMadnessEnd;
  const isNitActive = dayNum >= nitStart && dayNum <= nitEnd;

  let phase: NcaabTournamentPhase = "pre_tournament";
  if (isMarchMadnessActive || isNitActive) phase = "live_tournament";
  else if (dayNum >= archiveStart) phase = "post_tournament";

  return {
    phase,
    seasonYear,
    currentRoundLabel: getRoundLabel(dayNum, seasonYear),
    showTournamentTakeover: phase === "live_tournament",
    showArchiveEntry: phase === "post_tournament",
    isMarchMadnessActive,
    isNitActive,
  };
}

