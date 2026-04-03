export type TournamentKey = "march_madness" | "nit";

export type TournamentGame = {
  id: string;
  tournament: TournamentKey;
  round: string;
  region?: string;
  homeTeam: string;
  awayTeam: string;
  homeCode?: string;
  awayCode?: string;
  homeSeed?: number;
  awaySeed?: number;
  homeRecord?: string;
  awayRecord?: string;
  homeScore?: number;
  awayScore?: number;
  status: "LIVE" | "SCHEDULED" | "FINAL";
  startTime?: string;
  clock?: string;
  period?: string;
  statusDetail?: string;
};

export type BracketMatchup = {
  id: string;
  round: string;
  region: string;
  gameId: string;
  topTeam: string;
  bottomTeam: string;
  topSeed?: number;
  bottomSeed?: number;
  winner?: string;
  nextMatchupId?: string;
  nextSlot?: "top" | "bottom";
};

export type TournamentInsight = {
  id: string;
  type: "upset_watch" | "close_game" | "cinderella" | "mismatch" | "headline";
  severity: "low" | "medium" | "high";
  headline: string;
  rationale: string;
  gameId?: string;
  confidence: number;
};

export type UpsetAlertLevel = "low" | "medium" | "high";

export type BracketViewMode = "standard" | "live" | "classic";

export type LiveBracketState = "upcoming" | "live" | "final" | "overtime";

export type BracketOverlaySignals = {
  upsetLevel?: UpsetAlertLevel;
  coachGPick?: "top" | "bottom";
  cinderella?: boolean;
  publicPickPct?: number;
  winProbabilityPct?: number;
  closeGame?: boolean;
  upsetInProgress?: boolean;
  completedUpset?: boolean;
};

export type LiveBracketTeam = {
  name: string;
  shortName: string;
  seed?: number;
  score?: number;
  record?: string;
  logoCode: string;
  isWinner?: boolean;
  isEliminated?: boolean;
};

export type LiveBracketMatchup = {
  id: string;
  gameId: string;
  tournament: TournamentKey;
  region: string;
  round: string;
  roundOrder: number;
  state: LiveBracketState;
  statusLabel: string;
  startTimeLabel?: string;
  clockLabel?: string;
  topTeam: LiveBracketTeam;
  bottomTeam: LiveBracketTeam;
  winnerName?: string;
  nextMatchupId?: string;
  nextSlot?: "top" | "bottom";
  overlays: BracketOverlaySignals;
};

export type LiveBracketRound = {
  key: string;
  label: string;
  order: number;
  matchups: LiveBracketMatchup[];
};

export type LiveBracketRegion = {
  key: string;
  label: string;
  rounds: LiveBracketRound[];
};

export type LiveBracketTree = {
  tournament: TournamentKey;
  rounds: string[];
  regions: LiveBracketRegion[];
  centerRounds: LiveBracketRound[];
  totalMatchups: number;
};

export const MARCH_MADNESS_GAMES: TournamentGame[] = [
  { id: "mm-1", tournament: "march_madness", round: "Round of 64", region: "South", awayTeam: "Duke", homeTeam: "Vermont", awaySeed: 4, homeSeed: 13, status: "SCHEDULED" },
  { id: "mm-2", tournament: "march_madness", round: "Round of 64", region: "South", awayTeam: "Houston", homeTeam: "Longwood", awaySeed: 1, homeSeed: 16, status: "SCHEDULED" },
  { id: "mm-3", tournament: "march_madness", round: "Round of 64", region: "East", awayTeam: "UConn", homeTeam: "Stetson", awaySeed: 1, homeSeed: 16, status: "SCHEDULED" },
  { id: "mm-4", tournament: "march_madness", round: "Round of 64", region: "Midwest", awayTeam: "Purdue", homeTeam: "Grambling", awaySeed: 1, homeSeed: 16, status: "SCHEDULED" },
  { id: "mm-5", tournament: "march_madness", round: "Round of 64", region: "West", awayTeam: "Arizona", homeTeam: "Colgate", awaySeed: 2, homeSeed: 15, status: "SCHEDULED" },
  { id: "mm-6", tournament: "march_madness", round: "Round of 64", region: "West", awayTeam: "Tennessee", homeTeam: "Akron", awaySeed: 2, homeSeed: 15, status: "SCHEDULED" },
];

export const NIT_GAMES: TournamentGame[] = [
  { id: "nit-1", tournament: "nit", round: "Quarterfinal", awayTeam: "Seton Hall", homeTeam: "SMU", awaySeed: 2, homeSeed: 3, status: "SCHEDULED" },
  { id: "nit-2", tournament: "nit", round: "Quarterfinal", awayTeam: "Villanova", homeTeam: "Wake Forest", awaySeed: 1, homeSeed: 4, status: "FINAL", awayScore: 71, homeScore: 68 },
  { id: "nit-3", tournament: "nit", round: "Quarterfinal", awayTeam: "Pittsburgh", homeTeam: "Ohio State", awaySeed: 5, homeSeed: 2, status: "LIVE", awayScore: 49, homeScore: 50 },
];

export const MARCH_BRACKET_MATCHUPS: BracketMatchup[] = [
  { id: "s-1", round: "Round of 64", region: "South", gameId: "mm-2", topTeam: "Houston", bottomTeam: "Longwood", topSeed: 1, bottomSeed: 16, winner: "Houston", nextMatchupId: "s-elite-1", nextSlot: "top" },
  { id: "s-2", round: "Round of 64", region: "South", gameId: "mm-1", topTeam: "Duke", bottomTeam: "Vermont", topSeed: 4, bottomSeed: 13, nextMatchupId: "s-elite-1", nextSlot: "bottom" },
  { id: "s-elite-1", round: "Elite Eight", region: "South", gameId: "mm-south-e8", topTeam: "Houston", bottomTeam: "Duke", topSeed: 1, bottomSeed: 4, winner: "Houston", nextMatchupId: "ff-1", nextSlot: "top" },
  { id: "e-1", round: "Round of 64", region: "East", gameId: "mm-3", topTeam: "UConn", bottomTeam: "Stetson", topSeed: 1, bottomSeed: 16, winner: "UConn", nextMatchupId: "e-elite-1", nextSlot: "top" },
  { id: "e-2", round: "Round of 64", region: "East", gameId: "mm-east-r64-2", topTeam: "Baylor", bottomTeam: "Yale", topSeed: 3, bottomSeed: 14, nextMatchupId: "e-elite-1", nextSlot: "bottom" },
  { id: "e-elite-1", round: "Elite Eight", region: "East", gameId: "mm-east-e8", topTeam: "UConn", bottomTeam: "Baylor", topSeed: 1, bottomSeed: 3, winner: "UConn", nextMatchupId: "ff-1", nextSlot: "bottom" },
  { id: "mw-1", round: "Round of 64", region: "Midwest", gameId: "mm-4", topTeam: "Purdue", bottomTeam: "Grambling", topSeed: 1, bottomSeed: 16, nextMatchupId: "mw-elite-1", nextSlot: "top" },
  { id: "mw-2", round: "Round of 64", region: "Midwest", gameId: "mm-mid-r64-2", topTeam: "Kansas", bottomTeam: "Samford", topSeed: 4, bottomSeed: 13, nextMatchupId: "mw-elite-1", nextSlot: "bottom" },
  { id: "mw-elite-1", round: "Elite Eight", region: "Midwest", gameId: "mm-mid-e8", topTeam: "Purdue", bottomTeam: "Kansas", topSeed: 1, bottomSeed: 4, winner: "Purdue", nextMatchupId: "ff-2", nextSlot: "top" },
  { id: "w-1", round: "Round of 64", region: "West", gameId: "mm-5", topTeam: "Arizona", bottomTeam: "Colgate", topSeed: 2, bottomSeed: 15, nextMatchupId: "w-elite-1", nextSlot: "top" },
  { id: "w-2", round: "Round of 64", region: "West", gameId: "mm-6", topTeam: "Tennessee", bottomTeam: "Akron", topSeed: 2, bottomSeed: 15, nextMatchupId: "w-elite-1", nextSlot: "bottom" },
  { id: "w-elite-1", round: "Elite Eight", region: "West", gameId: "mm-west-e8", topTeam: "Arizona", bottomTeam: "Tennessee", topSeed: 2, bottomSeed: 2, winner: "Arizona", nextMatchupId: "ff-2", nextSlot: "bottom" },
  { id: "ff-1", round: "Final Four", region: "Final Four", gameId: "mm-ff-1", topTeam: "Houston", bottomTeam: "UConn", topSeed: 1, bottomSeed: 1, winner: "UConn", nextMatchupId: "natty-1", nextSlot: "top" },
  { id: "ff-2", round: "Final Four", region: "Final Four", gameId: "mm-ff-2", topTeam: "Purdue", bottomTeam: "Arizona", topSeed: 1, bottomSeed: 2, winner: "Purdue", nextMatchupId: "natty-1", nextSlot: "bottom" },
  { id: "natty-1", round: "Championship", region: "Championship", gameId: "mm-champ", topTeam: "UConn", bottomTeam: "Purdue", topSeed: 1, bottomSeed: 1 },
];

export const NIT_BRACKET_MATCHUPS: BracketMatchup[] = [
  { id: "nq-1", round: "Quarterfinal", region: "NIT", gameId: "nit-1", topTeam: "Seton Hall", bottomTeam: "SMU", topSeed: 2, bottomSeed: 3 },
  { id: "nq-2", round: "Quarterfinal", region: "NIT", gameId: "nit-2", topTeam: "Villanova", bottomTeam: "Wake Forest", topSeed: 1, bottomSeed: 4, winner: "Villanova" },
  { id: "nq-3", round: "Quarterfinal", region: "NIT", gameId: "nit-3", topTeam: "Pittsburgh", bottomTeam: "Ohio State", topSeed: 5, bottomSeed: 2 },
];

export const MARCH_INSIGHTS: TournamentInsight[] = [
  { id: "i-1", type: "upset_watch", severity: "high", headline: "High Alert: 4-13 spot", rationale: "Duke has turnover risk against a veteran Vermont backcourt.", gameId: "mm-1", confidence: 71 },
  { id: "i-2", type: "close_game", severity: "medium", headline: "Close game radar", rationale: "Tennessee-Akron pace profile projects a one-possession finish.", gameId: "mm-6", confidence: 63 },
  { id: "i-3", type: "cinderella", severity: "medium", headline: "Cinderella watch", rationale: "Akron's 3PT volume gives upset pathways if Tennessee goes cold.", gameId: "mm-6", confidence: 67 },
  { id: "i-4", type: "mismatch", severity: "low", headline: "Seed mismatch stable", rationale: "Houston's defensive rebounding edge lowers variance in this 1-16 game.", gameId: "mm-2", confidence: 82 },
];

export const NIT_INSIGHTS: TournamentInsight[] = [
  { id: "ni-1", type: "headline", severity: "medium", headline: "NIT pressure spot", rationale: "Villanova closing-line strength has translated to late game execution.", gameId: "nit-2", confidence: 69 },
  { id: "ni-2", type: "close_game", severity: "medium", headline: "Tight finish expected", rationale: "Pitt-Ohio State free throw rates point to late lead changes.", gameId: "nit-3", confidence: 62 },
];

const MARCH_REGIONS = ["South", "East", "Midwest", "West"] as const;
const R64_SEED_PAIRS: Array<[number, number]> = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
];

function deriveWinnerTeam(game: TournamentGame | undefined): string | undefined {
  if (!game || game.status !== "FINAL") return undefined;
  if (!isFiniteNumber(game.homeScore) || !isFiniteNumber(game.awayScore)) return undefined;
  return Number(game.homeScore) > Number(game.awayScore) ? game.homeTeam : game.awayTeam;
}

function deriveWinnerSeed(game: TournamentGame | undefined): number | undefined {
  if (!game || game.status !== "FINAL") return undefined;
  if (!isFiniteNumber(game.homeScore) || !isFiniteNumber(game.awayScore)) return undefined;
  return Number(game.homeScore) > Number(game.awayScore) ? game.homeSeed : game.awaySeed;
}

function seedPairMatches(game: TournamentGame, a: number, b: number): boolean {
  const seeds = [game.awaySeed, game.homeSeed].filter((s): s is number => Number.isFinite(s)).sort((x, y) => x - y);
  return seeds.length === 2 && seeds[0] === Math.min(a, b) && seeds[1] === Math.max(a, b);
}

function pickSeedTeam(game: TournamentGame, seed: number): string | undefined {
  if (game.awaySeed === seed) return game.awayTeam;
  if (game.homeSeed === seed) return game.homeTeam;
  return undefined;
}

function normalizeRound(round: string): string {
  const token = normalizeToken(round);
  if (token.includes("round of 64")) return "Round of 64";
  if (token.includes("round of 32")) return "Round of 32";
  if (token.includes("sweet 16")) return "Sweet 16";
  if (token.includes("elite eight")) return "Elite Eight";
  if (token.includes("final four")) return "Final Four";
  if (token.includes("championship")) return "Championship";
  return round;
}

function matchByTeams(
  games: TournamentGame[],
  used: Set<string>,
  round: string,
  region: string | undefined,
  topTeam?: string,
  bottomTeam?: string
): TournamentGame | undefined {
  const normalizedRound = normalizeRound(round);
  const topToken = normalizeToken(String(topTeam || ""));
  const bottomToken = normalizeToken(String(bottomTeam || ""));
  return games.find((g) => {
    if (used.has(g.id)) return false;
    if (normalizeRound(g.round) !== normalizedRound) return false;
    if (region && g.region && normalizeToken(g.region) !== normalizeToken(region)) return false;
    const a = normalizeToken(g.awayTeam);
    const h = normalizeToken(g.homeTeam);
    if (!topToken || !bottomToken) return false;
    return (a === topToken && h === bottomToken) || (a === bottomToken && h === topToken);
  });
}

export function buildMarchMadnessMatchupsFromGames(games: TournamentGame[]): BracketMatchup[] {
  const mmGames = games.filter((g) => g.tournament === "march_madness");
  const r64Games = mmGames.filter((g) => normalizeRound(g.round) === "Round of 64");
  const r64WithSeeds = r64Games.filter((g) => Number.isFinite(g.awaySeed) && Number.isFinite(g.homeSeed));
  // Provider feeds sometimes omit seeds entirely; in that case we build a seedless bracket
  // from round buckets so completed tournament games do not collapse into TBD chains.
  if (r64Games.length >= 16 && r64WithSeeds.length < 8) {
    return buildMarchMadnessMatchupsSeedless(mmGames);
  }

  const used = new Set<string>();
  const result: BracketMatchup[] = [];
  const knownRegionTokens = new Set(MARCH_REGIONS.map((r) => normalizeToken(r)));
  const allR64Games = mmGames.filter((g) => normalizeRound(g.round) === "Round of 64");
  const unknownRegionR64Games = allR64Games.filter((g) => !knownRegionTokens.has(normalizeToken(String(g.region || ""))));

  const byRegionAndRound = (region: string, round: string) =>
    mmGames.filter((g) =>
      normalizeRound(g.round) === round &&
      normalizeToken(String(g.region || "")) === normalizeToken(region)
    );

  const regionWinners: Array<{ region: string; team: string; seed?: number; gameId: string }> = [];
  const assignedR64 = new Map<string, Array<TournamentGame | undefined>>(
    MARCH_REGIONS.map((region) => [region, new Array<TournamentGame | undefined>(8).fill(undefined)])
  );

  // Pass 1: exact region + seed pair
  for (let i = 0; i < R64_SEED_PAIRS.length; i++) {
    const [topSeed, bottomSeed] = R64_SEED_PAIRS[i];
    for (const region of MARCH_REGIONS) {
      const game = mmGames.find((g) =>
        !used.has(g.id)
        && normalizeRound(g.round) === "Round of 64"
        && normalizeToken(String(g.region || "")) === normalizeToken(region)
        && seedPairMatches(g, topSeed, bottomSeed)
      );
      if (!game) continue;
      assignedR64.get(region)![i] = game;
      used.add(game.id);
    }
  }

  // Pass 2: unknown region + seed pair, spread by seed slot across regions
  for (let i = 0; i < R64_SEED_PAIRS.length; i++) {
    const [topSeed, bottomSeed] = R64_SEED_PAIRS[i];
    for (const region of MARCH_REGIONS) {
      if (assignedR64.get(region)![i]) continue;
      const game = unknownRegionR64Games.find((g) => !used.has(g.id) && seedPairMatches(g, topSeed, bottomSeed));
      if (!game) continue;
      assignedR64.get(region)![i] = game;
      used.add(game.id);
    }
  }

  // Pass 3: exact region remaining games (any seed), then unknown remaining games
  for (const region of MARCH_REGIONS) {
    for (let i = 0; i < R64_SEED_PAIRS.length; i++) {
      if (assignedR64.get(region)![i]) continue;
      const regionGame = mmGames.find((g) =>
        !used.has(g.id)
        && normalizeRound(g.round) === "Round of 64"
        && normalizeToken(String(g.region || "")) === normalizeToken(region)
      );
      if (regionGame) {
        assignedR64.get(region)![i] = regionGame;
        used.add(regionGame.id);
        continue;
      }
      const unknownGame = unknownRegionR64Games.find((g) => !used.has(g.id));
      if (unknownGame) {
        assignedR64.get(region)![i] = unknownGame;
        used.add(unknownGame.id);
      }
    }
  }

  for (const region of MARCH_REGIONS) {
    const regionCode = region.toLowerCase().slice(0, 2);
    const r64Games = byRegionAndRound(region, "Round of 64");
    const preassigned = assignedR64.get(region) || [];
    const r64: BracketMatchup[] = [];
    for (let i = 0; i < 8; i++) {
      const [topSeed, bottomSeed] = R64_SEED_PAIRS[i];
      const game = preassigned[i]
        || r64Games.find((g) => !used.has(g.id) && seedPairMatches(g, topSeed, bottomSeed))
        || mmGames.find((g) => !used.has(g.id) && normalizeRound(g.round) === "Round of 64" && seedPairMatches(g, topSeed, bottomSeed));
      if (game && !used.has(game.id)) used.add(game.id);
      const topTeam = game ? pickSeedTeam(game, topSeed) || game.awayTeam || `#${topSeed} TBD` : `#${topSeed} TBD`;
      const bottomTeam = game ? pickSeedTeam(game, bottomSeed) || game.homeTeam || `#${bottomSeed} TBD` : `#${bottomSeed} TBD`;
      r64.push({
        id: `${regionCode}-r64-${i + 1}`,
        round: "Round of 64",
        region,
        gameId: game?.id || `${regionCode}-r64-game-${i + 1}`,
        topTeam,
        bottomTeam,
        topSeed,
        bottomSeed,
        winner: deriveWinnerTeam(game),
        nextMatchupId: `${regionCode}-r32-${Math.floor(i / 2) + 1}`,
        nextSlot: i % 2 === 0 ? "top" : "bottom",
      });
    }
    result.push(...r64);

    const r32: BracketMatchup[] = [];
    for (let i = 0; i < 4; i++) {
      const topParent = r64[i * 2];
      const bottomParent = r64[i * 2 + 1];
      const topTeam = topParent.winner || "TBD";
      const bottomTeam = bottomParent.winner || "TBD";
      const game = matchByTeams(mmGames, used, "Round of 32", region, topTeam, bottomTeam);
      if (game) used.add(game.id);
      r32.push({
        id: `${regionCode}-r32-${i + 1}`,
        round: "Round of 32",
        region,
        gameId: game?.id || `${regionCode}-r32-game-${i + 1}`,
        topTeam,
        bottomTeam,
        topSeed: deriveWinnerSeed(matchByTeams(mmGames, new Set<string>(), "Round of 64", region, topParent.topTeam, topParent.bottomTeam)) ?? topParent.topSeed,
        bottomSeed: deriveWinnerSeed(matchByTeams(mmGames, new Set<string>(), "Round of 64", region, bottomParent.topTeam, bottomParent.bottomTeam)) ?? bottomParent.topSeed,
        winner: deriveWinnerTeam(game),
        nextMatchupId: `${regionCode}-s16-${Math.floor(i / 2) + 1}`,
        nextSlot: i % 2 === 0 ? "top" : "bottom",
      });
    }
    result.push(...r32);

    const s16: BracketMatchup[] = [];
    for (let i = 0; i < 2; i++) {
      const topParent = r32[i * 2];
      const bottomParent = r32[i * 2 + 1];
      const topTeam = topParent.winner || "TBD";
      const bottomTeam = bottomParent.winner || "TBD";
      const game = matchByTeams(mmGames, used, "Sweet 16", region, topTeam, bottomTeam);
      if (game) used.add(game.id);
      s16.push({
        id: `${regionCode}-s16-${i + 1}`,
        round: "Sweet 16",
        region,
        gameId: game?.id || `${regionCode}-s16-game-${i + 1}`,
        topTeam,
        bottomTeam,
        winner: deriveWinnerTeam(game),
        nextMatchupId: `${regionCode}-e8-1`,
        nextSlot: i % 2 === 0 ? "top" : "bottom",
      });
    }
    result.push(...s16);

    const e8Top = s16[0];
    const e8Bottom = s16[1];
    const e8TopTeam = e8Top?.winner || "TBD";
    const e8BottomTeam = e8Bottom?.winner || "TBD";
    const e8Game = matchByTeams(mmGames, used, "Elite Eight", region, e8TopTeam, e8BottomTeam);
    if (e8Game) used.add(e8Game.id);
    const elite = {
      id: `${regionCode}-e8-1`,
      round: "Elite Eight",
      region,
      gameId: e8Game?.id || `${regionCode}-e8-game-1`,
      topTeam: e8TopTeam,
      bottomTeam: e8BottomTeam,
      winner: deriveWinnerTeam(e8Game),
    };
    result.push(elite);
    regionWinners.push({
      region,
      team: elite.winner || "TBD",
      seed: deriveWinnerSeed(e8Game),
      gameId: elite.gameId,
    });
  }

  const south = regionWinners.find((w) => w.region === "South");
  const east = regionWinners.find((w) => w.region === "East");
  const midwest = regionWinners.find((w) => w.region === "Midwest");
  const west = regionWinners.find((w) => w.region === "West");

  const ff1Game = matchByTeams(mmGames, used, "Final Four", "Final Four", south?.team, east?.team)
    || matchByTeams(mmGames, used, "Final Four", undefined, south?.team, east?.team);
  if (ff1Game) used.add(ff1Game.id);
  const ff2Game = matchByTeams(mmGames, used, "Final Four", "Final Four", midwest?.team, west?.team)
    || matchByTeams(mmGames, used, "Final Four", undefined, midwest?.team, west?.team);
  if (ff2Game) used.add(ff2Game.id);

  const ff1: BracketMatchup = {
    id: "ff-1",
    round: "Final Four",
    region: "Final Four",
    gameId: ff1Game?.id || "ff-1-game",
    topTeam: south?.team || "TBD",
    bottomTeam: east?.team || "TBD",
    topSeed: south?.seed,
    bottomSeed: east?.seed,
    winner: deriveWinnerTeam(ff1Game),
    nextMatchupId: "natty-1",
    nextSlot: "top",
  };
  const ff2: BracketMatchup = {
    id: "ff-2",
    round: "Final Four",
    region: "Final Four",
    gameId: ff2Game?.id || "ff-2-game",
    topTeam: midwest?.team || "TBD",
    bottomTeam: west?.team || "TBD",
    topSeed: midwest?.seed,
    bottomSeed: west?.seed,
    winner: deriveWinnerTeam(ff2Game),
    nextMatchupId: "natty-1",
    nextSlot: "bottom",
  };
  result.push(ff1, ff2);

  const champGame = matchByTeams(mmGames, used, "Championship", "Championship", ff1.winner, ff2.winner)
    || matchByTeams(mmGames, used, "Championship", undefined, ff1.winner, ff2.winner);
  if (champGame) used.add(champGame.id);
  result.push({
    id: "natty-1",
    round: "Championship",
    region: "Championship",
    gameId: champGame?.id || "natty-game-1",
    topTeam: ff1.winner || "TBD",
    bottomTeam: ff2.winner || "TBD",
    winner: deriveWinnerTeam(champGame),
  });

  return result;
}

function buildMarchMadnessMatchupsSeedless(mmGames: TournamentGame[]): BracketMatchup[] {
  const sortByStart = (rows: TournamentGame[]) =>
    [...rows].sort((a, b) => {
      const at = new Date(String(a.startTime || "")).getTime();
      const bt = new Date(String(b.startTime || "")).getTime();
      const av = Number.isNaN(at) ? Number.MAX_SAFE_INTEGER : at;
      const bv = Number.isNaN(bt) ? Number.MAX_SAFE_INTEGER : bt;
      if (av !== bv) return av - bv;
      return String(a.id).localeCompare(String(b.id));
    });

  const byRound = (round: string) => sortByStart(mmGames.filter((g) => normalizeRound(g.round) === round));
  const takeChunk = (rows: TournamentGame[], offset: number, size: number) => rows.slice(offset, offset + size);
  const winnerName = (game: TournamentGame | undefined): string | undefined => deriveWinnerTeam(game);
  const winnerSeed = (game: TournamentGame | undefined): number | undefined => deriveWinnerSeed(game);
  const takeNextUnused = (rows: TournamentGame[], used: Set<string>): TournamentGame | undefined => {
    const next = rows.find((g) => !used.has(g.id));
    if (next) used.add(next.id);
    return next;
  };

  const r64 = byRound("Round of 64");
  const r32 = byRound("Round of 32");
  const s16 = byRound("Sweet 16");
  const e8 = byRound("Elite Eight");
  const ff = byRound("Final Four");
  const champ = byRound("Championship");

  const regionCodes: Record<string, string> = { South: "so", East: "ea", Midwest: "mi", West: "we" };
  const result: BracketMatchup[] = [];
  const regionWinners: Array<{ region: string; team: string; seed?: number; gameId: string }> = [];
  const used = new Set<string>();

  for (let regionIndex = 0; regionIndex < MARCH_REGIONS.length; regionIndex++) {
    const region = MARCH_REGIONS[regionIndex];
    const regionCode = regionCodes[region] || region.toLowerCase().slice(0, 2);
    const r64Chunk = takeChunk(r64, regionIndex * 8, 8);

    const r64Nodes: BracketMatchup[] = [];
    for (let i = 0; i < 8; i++) {
      const game = r64Chunk[i];
      if (game) used.add(game.id);
      const topSeed = game?.awaySeed ?? R64_SEED_PAIRS[i]?.[0];
      const bottomSeed = game?.homeSeed ?? R64_SEED_PAIRS[i]?.[1];
      r64Nodes.push({
        id: `${regionCode}-r64-${i + 1}`,
        round: "Round of 64",
        region,
        gameId: game?.id || `${regionCode}-r64-game-${i + 1}`,
        topTeam: game?.awayTeam || `#${topSeed ?? "?"} TBD`,
        bottomTeam: game?.homeTeam || `#${bottomSeed ?? "?"} TBD`,
        topSeed,
        bottomSeed,
        winner: winnerName(game),
        nextMatchupId: `${regionCode}-r32-${Math.floor(i / 2) + 1}`,
        nextSlot: i % 2 === 0 ? "top" : "bottom",
      });
    }
    result.push(...r64Nodes);

    const r32Nodes: BracketMatchup[] = [];
    for (let i = 0; i < 4; i++) {
      const topParent = r64Nodes[i * 2];
      const bottomParent = r64Nodes[i * 2 + 1];
      const topGuess = topParent?.winner || topParent?.topTeam || "TBD";
      const bottomGuess = bottomParent?.winner || bottomParent?.bottomTeam || "TBD";
      const game = matchByTeams(mmGames, used, "Round of 32", undefined, topGuess, bottomGuess)
        || takeNextUnused(r32, used);
      r32Nodes.push({
        id: `${regionCode}-r32-${i + 1}`,
        round: "Round of 32",
        region,
        gameId: game?.id || `${regionCode}-r32-game-${i + 1}`,
        topTeam: game?.awayTeam || topGuess,
        bottomTeam: game?.homeTeam || bottomGuess,
        topSeed: game?.awaySeed ?? topParent?.topSeed,
        bottomSeed: game?.homeSeed ?? bottomParent?.bottomSeed,
        winner: winnerName(game),
        nextMatchupId: `${regionCode}-s16-${Math.floor(i / 2) + 1}`,
        nextSlot: i % 2 === 0 ? "top" : "bottom",
      });
    }
    result.push(...r32Nodes);

    const s16Nodes: BracketMatchup[] = [];
    for (let i = 0; i < 2; i++) {
      const topParent = r32Nodes[i * 2];
      const bottomParent = r32Nodes[i * 2 + 1];
      const topGuess = topParent?.winner || topParent?.topTeam || "TBD";
      const bottomGuess = bottomParent?.winner || bottomParent?.bottomTeam || "TBD";
      const game = matchByTeams(mmGames, used, "Sweet 16", undefined, topGuess, bottomGuess)
        || takeNextUnused(s16, used);
      s16Nodes.push({
        id: `${regionCode}-s16-${i + 1}`,
        round: "Sweet 16",
        region,
        gameId: game?.id || `${regionCode}-s16-game-${i + 1}`,
        topTeam: game?.awayTeam || topGuess,
        bottomTeam: game?.homeTeam || bottomGuess,
        winner: winnerName(game),
        nextMatchupId: `${regionCode}-e8-1`,
        nextSlot: i % 2 === 0 ? "top" : "bottom",
      });
    }
    result.push(...s16Nodes);

    const e8TopGuess = s16Nodes[0]?.winner || s16Nodes[0]?.topTeam || "TBD";
    const e8BottomGuess = s16Nodes[1]?.winner || s16Nodes[1]?.bottomTeam || "TBD";
    const e8Game = matchByTeams(mmGames, used, "Elite Eight", undefined, e8TopGuess, e8BottomGuess)
      || takeNextUnused(e8, used);
    const elite: BracketMatchup = {
      id: `${regionCode}-e8-1`,
      round: "Elite Eight",
      region,
      gameId: e8Game?.id || `${regionCode}-e8-game-1`,
      topTeam: e8Game?.awayTeam || e8TopGuess,
      bottomTeam: e8Game?.homeTeam || e8BottomGuess,
      winner: winnerName(e8Game),
    };
    result.push(elite);
    regionWinners.push({
      region,
      team: elite.winner || "TBD",
      seed: winnerSeed(e8Game),
      gameId: elite.gameId,
    });
  }

  const south = regionWinners.find((w) => w.region === "South");
  const east = regionWinners.find((w) => w.region === "East");
  const midwest = regionWinners.find((w) => w.region === "Midwest");
  const west = regionWinners.find((w) => w.region === "West");
  const ff1Game = matchByTeams(mmGames, used, "Final Four", undefined, south?.team, east?.team)
    || takeNextUnused(ff, used);
  const ff2Game = matchByTeams(mmGames, used, "Final Four", undefined, midwest?.team, west?.team)
    || takeNextUnused(ff, used);

  const ff1: BracketMatchup = {
    id: "ff-1",
    round: "Final Four",
    region: "Final Four",
    gameId: ff1Game?.id || "ff-1-game",
    topTeam: ff1Game?.awayTeam || south?.team || "TBD",
    bottomTeam: ff1Game?.homeTeam || east?.team || "TBD",
    topSeed: ff1Game?.awaySeed ?? south?.seed,
    bottomSeed: ff1Game?.homeSeed ?? east?.seed,
    winner: winnerName(ff1Game),
    nextMatchupId: "natty-1",
    nextSlot: "top",
  };
  const ff2: BracketMatchup = {
    id: "ff-2",
    round: "Final Four",
    region: "Final Four",
    gameId: ff2Game?.id || "ff-2-game",
    topTeam: ff2Game?.awayTeam || midwest?.team || "TBD",
    bottomTeam: ff2Game?.homeTeam || west?.team || "TBD",
    topSeed: ff2Game?.awaySeed ?? midwest?.seed,
    bottomSeed: ff2Game?.homeSeed ?? west?.seed,
    winner: winnerName(ff2Game),
    nextMatchupId: "natty-1",
    nextSlot: "bottom",
  };
  result.push(ff1, ff2);

  const champGame = matchByTeams(mmGames, used, "Championship", undefined, ff1.winner, ff2.winner)
    || takeNextUnused(champ, used);
  result.push({
    id: "natty-1",
    round: "Championship",
    region: "Championship",
    gameId: champGame?.id || "natty-game-1",
    topTeam: champGame?.awayTeam || ff1.winner || "TBD",
    bottomTeam: champGame?.homeTeam || ff2.winner || "TBD",
    winner: winnerName(champGame),
  });

  return result;
}

function normalizeToken(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(Number(value));
}

function parseDateDayNumber(dateText: string): number | null {
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function parseSeed(value: unknown): number | undefined {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  const text = String(value || "");
  const m = text.match(/#?\s?(\d{1,2})/);
  if (!m) return undefined;
  const parsed = Number(m[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toTeamAbbr(teamName: string): string {
  const normalized = String(teamName || "")
    .replace(/^#\s?\d{1,2}\s+/i, "")
    .trim();
  if (!normalized) return "TEAM";
  if (normalizeToken(normalized).includes("tbd")) return "TBD";
  const tokens = normalized
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return "TEAM";
  if (tokens.length === 1) return tokens[0].slice(0, 3).toUpperCase();
  return tokens
    .slice(0, 3)
    .map((t) => t[0])
    .join("")
    .toUpperCase();
}

const TEAM_CODE_NAME_OVERRIDES: Record<string, string> = {
  "utah state": "USU",
  "uconn": "UCONN",
  "connecticut": "UCONN",
  "grambling": "GRMBST",
  "longwood": "LONGWD",
  "stetson": "STETSN",
};

function likelySameTeamName(a: string, b: string): boolean {
  const left = normalizeToken(a);
  const right = normalizeToken(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftFirst = left.split(" ")[0] || "";
  const rightFirst = right.split(" ")[0] || "";
  return Boolean(leftFirst && rightFirst && leftFirst === rightFirst);
}

function normalizeTeamCodeForName(rawCode: string, teamName: string): string {
  const nameToken = normalizeToken(teamName);
  const overridden = TEAM_CODE_NAME_OVERRIDES[nameToken];
  if (overridden) return overridden;
  let code = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code || code === "TBD") return "TBD";
  if (code === "UTSA" && nameToken.includes("utah state")) return "USU";
  if (code.length <= 2) return toTeamAbbr(teamName);
  if (code.length > 6) code = code.slice(0, 6);
  return code;
}

function resolveTeamCode(teamName: string, codeByTeam: Map<string, string>): string {
  const target = normalizeToken(teamName);
  const direct = codeByTeam.get(target);
  if (direct) return normalizeTeamCodeForName(direct, teamName);

  let bestCode = "";
  let bestScore = -1;
  for (const [knownTeam, code] of codeByTeam.entries()) {
    if (!knownTeam || !code) continue;
    let score = -1;
    if (knownTeam === target) score = 1000;
    else if (knownTeam.includes(target) || target.includes(knownTeam)) score = Math.min(knownTeam.length, target.length);
    else if (likelySameTeamName(knownTeam, target)) score = 10;
    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }
  return normalizeTeamCodeForName(bestCode || toTeamAbbr(teamName), teamName);
}

function roundSortOrder(round: string): number {
  const token = normalizeToken(round);
  if (token.includes("first four")) return 1;
  if (token.includes("round of 64")) return 2;
  if (token.includes("round of 32")) return 3;
  if (token.includes("sweet 16")) return 4;
  if (token.includes("elite eight")) return 5;
  if (token.includes("final four")) return 6;
  if (token.includes("championship")) return 7;
  if (token.includes("first round")) return 2;
  if (token.includes("quarterfinal")) return 4;
  if (token.includes("semifinal")) return 6;
  return 50;
}

function toGameState(game: TournamentGame | undefined): LiveBracketState {
  if (!game) return "upcoming";
  const detail = normalizeToken(game.statusDetail || "");
  if (game.status === "LIVE" && (detail.includes("ot") || detail.includes("overtime"))) return "overtime";
  if (game.status === "LIVE") return "live";
  if (game.status === "FINAL") return "final";
  return "upcoming";
}

function toStatusLabel(game: TournamentGame | undefined): string {
  if (!game) return "UPCOMING";
  if (game.status === "LIVE") return game.period ? `LIVE ${game.period}` : "LIVE";
  if (game.status === "FINAL") return "FINAL";
  return "UPCOMING";
}

function formatStartTime(value?: string): string | undefined {
  if (!value) return undefined;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(dt);
}

function deriveWinnerName(
  matchup: BracketMatchup,
  game: TournamentGame | undefined
): string | undefined {
  if (matchup.winner) return matchup.winner;
  if (!game || game.status !== "FINAL") return undefined;
  if (!isFiniteNumber(game.homeScore) || !isFiniteNumber(game.awayScore)) return undefined;
  return Number(game.homeScore) > Number(game.awayScore) ? game.homeTeam : game.awayTeam;
}

function isCloseGame(game: TournamentGame | undefined): boolean {
  if (!game || game.status !== "LIVE") return false;
  if (!isFiniteNumber(game.homeScore) || !isFiniteNumber(game.awayScore)) return false;
  return Math.abs(Number(game.homeScore) - Number(game.awayScore)) <= 4;
}

function isCompletedUpset(game: TournamentGame | undefined): boolean {
  if (!game || game.status !== "FINAL") return false;
  if (!isFiniteNumber(game.homeScore) || !isFiniteNumber(game.awayScore)) return false;
  const homeSeed = game.homeSeed ?? 99;
  const awaySeed = game.awaySeed ?? 99;
  if (homeSeed === awaySeed) return false;
  const homeWon = Number(game.homeScore) > Number(game.awayScore);
  return homeWon ? homeSeed > awaySeed : awaySeed > homeSeed;
}

function isUpsetInProgress(game: TournamentGame | undefined): boolean {
  if (!game || game.status !== "LIVE") return false;
  if (!isFiniteNumber(game.homeScore) || !isFiniteNumber(game.awayScore)) return false;
  const homeSeed = game.homeSeed ?? 99;
  const awaySeed = game.awaySeed ?? 99;
  if (homeSeed === awaySeed) return false;
  const favoriteIsHome = homeSeed < awaySeed;
  return favoriteIsHome ? Number(game.homeScore) < Number(game.awayScore) : Number(game.awayScore) < Number(game.homeScore);
}

function readCompetitorField(
  g: Record<string, unknown>,
  side: "home" | "away",
  field: "seed" | "record" | "name" | "abbr"
): unknown {
  const competitors = Array.isArray(g.competitors) ? g.competitors : [];
  const target = competitors
    .map((c) => (c || {}) as Record<string, unknown>)
    .find((c) => String(c.homeAway || "").toLowerCase() === side);
  if (!target) return undefined;
  if (field === "seed") {
    return target.seed ?? target.rank ?? target.order;
  }
  if (field === "record") {
    return target.record ?? target.summary ?? target.team_record;
  }
  if (field === "abbr") {
    const team = (target.team ?? {}) as Record<string, unknown>;
    return target.abbreviation ?? target.abbr ?? target.alias ?? team.abbreviation;
  }
  const team = (target.team ?? {}) as Record<string, unknown>;
  return target.name ?? target.displayName ?? target.teamName ?? team.displayName;
}

function parseRoundFromProvider(g: Record<string, unknown>, tournament: TournamentKey, dayNum: number | null): string {
  const hint = normalizeToken(
    String(g.round || g.week || g.season_type || g.event_name || g.name || g.venue || "")
  );
  if (hint.includes("first four")) return "First Four";
  if (hint.includes("round of 64") || hint.includes("first round") || hint.includes("1st round")) return "Round of 64";
  if (hint.includes("round of 32") || hint.includes("second round") || hint.includes("2nd round")) return "Round of 32";
  if (hint.includes("sweet 16") || hint.includes("sweet sixteen") || hint.includes("regional semifinal")) return "Sweet 16";
  if (hint.includes("elite eight") || hint.includes("regional final")) return "Elite Eight";
  if (hint.includes("final four") || hint.includes("national semifinal")) return "Final Four";
  if (hint.includes("championship") || hint.includes("title") || hint.includes("national championship")) return "Championship";
  if (hint.includes("quarterfinal")) return "Quarterfinal";
  if (hint.includes("semifinal")) return "Semifinal";
  if (tournament === "nit") {
    if (!dayNum) return "Round";
    const monthDay = dayNum % 10000;
    if (monthDay <= 325) return "First Round";
    if (monthDay <= 331) return "Quarterfinal";
    if (monthDay <= 405) return "Semifinal";
    return "Championship";
  }
  if (!dayNum) return "Round of 64";
  const monthDay = dayNum % 10000;
  // Current feed cadence: First Four (Mar 17-18), Round of 64 (Mar 19-20),
  // Round of 32 (Mar 21-22). Keep this aligned with season helper.
  if (monthDay <= 318) return "First Four";
  if (monthDay <= 320) return "Round of 64";
  if (monthDay <= 322) return "Round of 32";
  // Modern cadence: Sweet 16 is Thu/Fri, Elite Eight is Sat/Sun.
  if (monthDay <= 327) return "Sweet 16";
  if (monthDay <= 329) return "Elite Eight";
  if (monthDay <= 331) return "Final Four";
  if (monthDay <= 406) return "Final Four";
  return "Championship";
}

function parseRegionFromProvider(g: Record<string, unknown>): string | undefined {
  const hint = normalizeToken(
    [
      g.region,
      g.round,
      g.week,
      g.season_type,
      g.event_name,
      g.name,
      g.venue,
      g.broadcast,
    ].map((v) => String(v || "")).join(" ")
  );
  if (hint.includes("east")) return "East";
  if (hint.includes("west")) return "West";
  if (hint.includes("south")) return "South";
  if (hint.includes("midwest")) return "Midwest";
  return undefined;
}

function isLikelyTournamentGame(g: Record<string, unknown>, tournament: TournamentKey): boolean {
  const sport = normalizeToken(String(g.sport || ""));
  if (!sport.includes("ncaab") && !sport.includes("basketball")) return false;
  const text = normalizeToken(
    [
      g.week,
      g.round,
      g.season_type,
      g.event_name,
      g.name,
      g.venue,
      g.broadcast,
    ].map((v) => String(v || "")).join(" ")
  );
  const dayNum = parseDateDayNumber(String(g.start_time || ""));
  const monthDay = dayNum ? dayNum % 10000 : null;
  const inMarchWindow = monthDay != null && monthDay >= 315 && monthDay <= 415;
  const homeSeed = parseSeed(g.home_seed ?? g.home_rank ?? g.homeTeamSeed ?? readCompetitorField(g, "home", "seed"));
  const awaySeed = parseSeed(g.away_seed ?? g.away_rank ?? g.awayTeamSeed ?? readCompetitorField(g, "away", "seed"));
  const broadcastText = normalizeToken(String(g.broadcast || ""));
  const onTournamentBroadcast =
    broadcastText.includes("cbs")
    || broadcastText.includes("tbs")
    || broadcastText.includes("tnt")
    || broadcastText.includes("trutv")
    || broadcastText.includes("tru tv");
  const hasBracketStyleSeeds =
    Number.isFinite(homeSeed)
    && Number.isFinite(awaySeed)
    && Number(homeSeed) >= 1
    && Number(homeSeed) <= 16
    && Number(awaySeed) >= 1
    && Number(awaySeed) <= 16;
  if (tournament === "march_madness") {
    return inMarchWindow && (
      text.includes("ncaa tournament")
      || text.includes("march madness")
      || text.includes("first four")
      || text.includes("first round")
      || text.includes("1st round")
      || text.includes("round of 64")
      || text.includes("second round")
      || text.includes("2nd round")
      || text.includes("round of 32")
      || text.includes("sweet 16")
      || text.includes("sweet sixteen")
      || text.includes("regional semifinal")
      || text.includes("elite eight")
      || text.includes("regional final")
      || text.includes("final four")
      || text.includes("national semifinal")
      || text.includes("championship")
      || text.includes("national championship")
      || hasBracketStyleSeeds
      || onTournamentBroadcast
    );
  }
  return inMarchWindow && (
    text.includes("nit")
    || text.includes("national invitation")
    || text.includes("quarterfinal")
    || text.includes("semifinal")
    || text.includes("championship")
  );
}

export function buildTournamentGamesFromProvider(
  providerGames: unknown[],
  tournament: TournamentKey
): TournamentGame[] {
  if (!Array.isArray(providerGames) || providerGames.length === 0) return [];
  return providerGames
    .map((raw) => (raw || {}) as Record<string, unknown>)
    .filter((g) => isLikelyTournamentGame(g, tournament))
    .map((g) => {
      const homeTeam = String(g.home_team_name || g.home_team_code || "").trim();
      const awayTeam = String(g.away_team_name || g.away_team_code || "").trim();
      const homeCode = String(g.home_team_code || readCompetitorField(g, "home", "abbr") || "").trim();
      const awayCode = String(g.away_team_code || readCompetitorField(g, "away", "abbr") || "").trim();
      const homeFromCompetitor = String(readCompetitorField(g, "home", "name") || "").trim();
      const awayFromCompetitor = String(readCompetitorField(g, "away", "name") || "").trim();
      const rawStatus = String(g.status || "").toUpperCase();
      const status: TournamentGame["status"] = rawStatus === "IN_PROGRESS" || rawStatus === "LIVE"
        ? "LIVE"
        : rawStatus === "FINAL" || rawStatus === "COMPLETED" || rawStatus === "CLOSED"
          ? "FINAL"
          : "SCHEDULED";
      const dayNum = parseDateDayNumber(String(g.start_time || ""));
      const rawClock = String(g.clock || g.game_clock || g.display_clock || "").trim();
      const rawPeriod = String(g.period || g.quarter || g.segment || "").trim();
      const statusDetail = String(g.status_detail || g.statusText || g.display_status || "").trim();
      return {
        id: String(g.game_id || g.id || `${tournament}-${homeTeam}-${awayTeam}`),
        tournament,
        round: parseRoundFromProvider(g, tournament, dayNum),
        region: parseRegionFromProvider(g),
        homeTeam: homeTeam || homeFromCompetitor || "Home",
        awayTeam: awayTeam || awayFromCompetitor || "Away",
        homeCode: homeCode || undefined,
        awayCode: awayCode || undefined,
        homeSeed: parseSeed(g.home_seed ?? g.home_rank ?? g.homeTeamSeed ?? readCompetitorField(g, "home", "seed")),
        awaySeed: parseSeed(g.away_seed ?? g.away_rank ?? g.awayTeamSeed ?? readCompetitorField(g, "away", "seed")),
        homeRecord: String(g.home_record || readCompetitorField(g, "home", "record") || "").trim() || undefined,
        awayRecord: String(g.away_record || readCompetitorField(g, "away", "record") || "").trim() || undefined,
        homeScore: isFiniteNumber(g.home_score) ? Number(g.home_score) : undefined,
        awayScore: isFiniteNumber(g.away_score) ? Number(g.away_score) : undefined,
        status,
        startTime: String(g.start_time || "") || undefined,
        clock: rawClock || undefined,
        period: rawPeriod ? `P${rawPeriod}` : undefined,
        statusDetail: statusDetail || undefined,
      };
    });
}

export function mergeProviderScores(baseGames: TournamentGame[], providerGames: unknown[]): TournamentGame[] {
  if (!Array.isArray(providerGames) || providerGames.length === 0) return baseGames;
  const normalized = providerGames.map((raw) => {
    const g = (raw || {}) as Record<string, unknown>;
    return {
      id: String(g.game_id || g.id || ""),
      home: String(g.home_team_name || g.home_team_code || "").toLowerCase().trim(),
      away: String(g.away_team_name || g.away_team_code || "").toLowerCase().trim(),
      status: String(g.status || "").toUpperCase(),
      homeScore: Number(g.home_score),
      awayScore: Number(g.away_score),
      startTime: String(g.start_time || ""),
      homeCode: String(g.home_team_code || "").trim(),
      awayCode: String(g.away_team_code || "").trim(),
      clock: String(g.clock || g.game_clock || g.display_clock || "").trim(),
      period: String(g.period || g.quarter || g.segment || "").trim(),
      statusDetail: String(g.status_detail || g.statusText || g.display_status || "").trim(),
    };
  });
  return baseGames.map((game) => {
    const match = normalized.find((g) =>
      (g.home && game.homeTeam.toLowerCase().includes(g.home))
      || (g.away && game.awayTeam.toLowerCase().includes(g.away))
      || (g.id && g.id === game.id)
    );
    if (!match) return game;
    const status = match.status === "IN_PROGRESS" || match.status === "LIVE"
      ? "LIVE"
      : match.status === "FINAL"
        ? "FINAL"
        : "SCHEDULED";
    return {
      ...game,
      status,
      homeScore: Number.isFinite(match.homeScore) ? match.homeScore : game.homeScore,
      awayScore: Number.isFinite(match.awayScore) ? match.awayScore : game.awayScore,
      startTime: match.startTime || game.startTime,
      homeCode: match.homeCode || game.homeCode,
      awayCode: match.awayCode || game.awayCode,
      clock: match.clock || game.clock,
      period: match.period ? `P${match.period}` : game.period,
      statusDetail: match.statusDetail || game.statusDetail,
    };
  });
}

export function mergeTournamentFeeds(baseGames: TournamentGame[], providerGames: unknown[], tournament: TournamentKey): TournamentGame[] {
  const enriched = buildTournamentGamesFromProvider(providerGames, tournament);
  const mergedBase = mergeProviderScores(baseGames, providerGames);
  if (enriched.length === 0) return mergedBase;
  const used = new Set<string>();
  const byPair = (g: TournamentGame) => `${normalizeToken(g.awayTeam)}|${normalizeToken(g.homeTeam)}`;
  const enrichedByPair = new Map(enriched.map((g) => [byPair(g), g]));
  const merged = mergedBase.map((base) => {
    const provider = enrichedByPair.get(byPair(base));
    if (!provider) return base;
    used.add(provider.id);
    return {
      ...base,
      ...provider,
      tournament: base.tournament,
      round: provider.round || base.round,
      region: provider.region || base.region,
      homeSeed: provider.homeSeed ?? base.homeSeed,
      awaySeed: provider.awaySeed ?? base.awaySeed,
      homeRecord: provider.homeRecord || base.homeRecord,
      awayRecord: provider.awayRecord || base.awayRecord,
    };
  });
  for (const extra of enriched) {
    if (used.has(extra.id)) continue;
    merged.push(extra);
  }
  return merged;
}

export function computeUpsetWatch(game: TournamentGame): {
  level: UpsetAlertLevel;
  score: number;
  reason: string;
} {
  const awaySeed = game.awaySeed ?? 8;
  const homeSeed = game.homeSeed ?? 9;
  const favoriteSeed = Math.min(awaySeed, homeSeed);
  const underdogSeed = Math.max(awaySeed, homeSeed);
  const seedGap = Math.max(0, underdogSeed - favoriteSeed);
  let score = Math.min(100, seedGap * 6);
  if (game.status === "LIVE" && isFiniteNumber(game.homeScore) && isFiniteNumber(game.awayScore)) {
    const favoriteIsAway = awaySeed <= homeSeed;
    const favScore = favoriteIsAway ? Number(game.awayScore) : Number(game.homeScore);
    const dogScore = favoriteIsAway ? Number(game.homeScore) : Number(game.awayScore);
    const liveMargin = Math.abs(favScore - dogScore);
    if (dogScore >= favScore) score += 25;
    if (liveMargin <= 4) score += 12;
  }
  if (game.status === "SCHEDULED" && seedGap >= 8) score += 5;
  if (game.round === "Round of 64" || game.round === "Round of 32") score += 6;
  const finalScore = Math.max(0, Math.min(100, score));
  const level: UpsetAlertLevel = finalScore >= 70 ? "high" : finalScore >= 45 ? "medium" : "low";
  const reason = level === "high"
    ? "Underdog profile and game state show real upset pathways."
    : level === "medium"
      ? "Moderate upset risk from seed gap and matchup volatility."
      : "Favorite profile remains comparatively stable.";
  return { level, score: finalScore, reason };
}

export function buildLiveBracketTree(
  tournament: TournamentKey,
  games: TournamentGame[],
  matchups: BracketMatchup[],
  overlays?: Record<string, Partial<BracketOverlaySignals>>
): LiveBracketTree {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const codeByTeam = new Map<string, string>();
  for (const game of games) {
    if (game.awayCode) codeByTeam.set(normalizeToken(game.awayTeam), game.awayCode.toUpperCase());
    if (game.homeCode) codeByTeam.set(normalizeToken(game.homeTeam), game.homeCode.toUpperCase());
  }

  const enriched: LiveBracketMatchup[] = matchups.map((matchup) => {
    const game = gameById.get(matchup.gameId);
    const computedUpset = game ? computeUpsetWatch(game) : { level: "low" as UpsetAlertLevel, score: 0 };
    const winnerName = deriveWinnerName(matchup, game);
    const topWinner = winnerName ? normalizeToken(winnerName) === normalizeToken(matchup.topTeam) : false;
    const bottomWinner = winnerName ? normalizeToken(winnerName) === normalizeToken(matchup.bottomTeam) : false;
    const extra = overlays?.[matchup.gameId] || {};

    const baseTopScore = game?.awayTeam && likelySameTeamName(game.awayTeam, matchup.topTeam)
      ? game.awayScore
      : game?.homeTeam && likelySameTeamName(game.homeTeam, matchup.topTeam)
        ? game.homeScore
        : undefined;
    const baseBottomScore = game?.awayTeam && likelySameTeamName(game.awayTeam, matchup.bottomTeam)
      ? game.awayScore
      : game?.homeTeam && likelySameTeamName(game.homeTeam, matchup.bottomTeam)
        ? game.homeScore
        : undefined;

    const topRecord = game?.awayTeam && likelySameTeamName(game.awayTeam, matchup.topTeam)
      ? game.awayRecord
      : game?.homeTeam && likelySameTeamName(game.homeTeam, matchup.topTeam)
        ? game.homeRecord
        : undefined;
    const bottomRecord = game?.awayTeam && likelySameTeamName(game.awayTeam, matchup.bottomTeam)
      ? game.awayRecord
      : game?.homeTeam && likelySameTeamName(game.homeTeam, matchup.bottomTeam)
        ? game.homeRecord
        : undefined;

    const topLogoCode = resolveTeamCode(matchup.topTeam, codeByTeam);
    const bottomLogoCode = resolveTeamCode(matchup.bottomTeam, codeByTeam);
    const topShortName = topLogoCode !== "TBD" ? topLogoCode : toTeamAbbr(matchup.topTeam);
    const bottomShortName = bottomLogoCode !== "TBD" ? bottomLogoCode : toTeamAbbr(matchup.bottomTeam);

    return {
      id: matchup.id,
      gameId: matchup.gameId,
      tournament,
      region: matchup.region,
      round: matchup.round,
      roundOrder: roundSortOrder(matchup.round),
      state: toGameState(game),
      statusLabel: toStatusLabel(game),
      startTimeLabel: formatStartTime(game?.startTime),
      clockLabel: game?.clock || undefined,
      topTeam: {
        name: matchup.topTeam,
        shortName: topShortName,
        seed: matchup.topSeed ?? game?.awaySeed ?? game?.homeSeed,
        score: baseTopScore,
        record: topRecord,
        logoCode: topLogoCode,
        isWinner: topWinner,
        isEliminated: bottomWinner,
      },
      bottomTeam: {
        name: matchup.bottomTeam,
        shortName: bottomShortName,
        seed: matchup.bottomSeed ?? game?.homeSeed ?? game?.awaySeed,
        score: baseBottomScore,
        record: bottomRecord,
        logoCode: bottomLogoCode,
        isWinner: bottomWinner,
        isEliminated: topWinner,
      },
      winnerName,
      nextMatchupId: matchup.nextMatchupId,
      nextSlot: matchup.nextSlot,
      overlays: {
        upsetLevel: computedUpset.level,
        closeGame: isCloseGame(game),
        upsetInProgress: isUpsetInProgress(game),
        completedUpset: isCompletedUpset(game),
        ...extra,
      },
    };
  });

  const roundSet = Array.from(new Set(enriched.map((m) => m.round)))
    .sort((a, b) => roundSortOrder(a) - roundSortOrder(b));

  const regionKeys = Array.from(
    new Set(
      enriched
        .map((m) => m.region)
        .filter((region) => region !== "Final Four" && region !== "Championship")
    )
  );

  const buildRoundBucket = (items: LiveBracketMatchup[]): LiveBracketRound[] =>
    roundSet.map((round) => ({
      key: `${round}`,
      label: round,
      order: roundSortOrder(round),
      matchups: items
        .filter((m) => m.round === round)
        .sort((a, b) => a.id.localeCompare(b.id)),
    })).filter((r) => r.matchups.length > 0);

  const regions: LiveBracketRegion[] = regionKeys.map((region) => ({
    key: region.toLowerCase(),
    label: region,
    rounds: buildRoundBucket(enriched.filter((m) => m.region === region)),
  }));

  const centerMatchups = enriched.filter((m) => m.region === "Final Four" || m.region === "Championship");
  const centerRounds = buildRoundBucket(centerMatchups);

  return {
    tournament,
    rounds: roundSet,
    regions,
    centerRounds,
    totalMatchups: enriched.length,
  };
}

export function resolveNavigableTournamentGameId(
  gameId: string,
  games: TournamentGame[],
  matchups: BracketMatchup[]
): string {
  const rawId = String(gameId || "").trim();
  if (!rawId) return "";
  const direct = games.find((g) => g.id === rawId);
  if (direct && !/^mm-/.test(rawId) && !/-game-/.test(rawId)) return rawId;

  const matchup = matchups.find((m) => m.gameId === rawId);
  if (!matchup) return rawId;

  const roundToken = normalizeRound(matchup.round);
  const candidate = games.find((g) => {
    if (!g.id || /^mm-/.test(g.id) || /-game-/.test(g.id)) return false;
    if (normalizeRound(g.round) !== roundToken) return false;
    const awayTopHomeBottom = likelySameTeamName(g.awayTeam, matchup.topTeam) && likelySameTeamName(g.homeTeam, matchup.bottomTeam);
    const awayBottomHomeTop = likelySameTeamName(g.awayTeam, matchup.bottomTeam) && likelySameTeamName(g.homeTeam, matchup.topTeam);
    return awayTopHomeBottom || awayBottomHomeTop;
  });
  if (candidate?.id) return candidate.id;

  const looseCandidate = games.find((g) => {
    if (!g.id || /^mm-/.test(g.id) || /-game-/.test(g.id)) return false;
    if (normalizeRound(g.round) !== roundToken) return false;
    if (matchup.region && g.region && normalizeToken(matchup.region) !== normalizeToken(g.region)) return false;
    return (
      likelySameTeamName(g.awayTeam, matchup.topTeam)
      || likelySameTeamName(g.awayTeam, matchup.bottomTeam)
      || likelySameTeamName(g.homeTeam, matchup.topTeam)
      || likelySameTeamName(g.homeTeam, matchup.bottomTeam)
    );
  });

  return looseCandidate?.id || rawId;
}


