import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Award, Flame, Sparkles } from "lucide-react";
import { PlayerPhoto } from "@/react-app/components/PlayerPhoto";

// Use centralized PlayerPhoto component instead of inline implementation

interface PlayerStat {
  playerId: string;
  name: string;
  teamCode: string;
  teamName: string;
  value: number;
  gamesPlayed: number;
  sampleSize?: number;
  rank: number;
  trend?: "up" | "down" | "same";
  imageUrl?: string;
}

interface StatCategory {
  key: string;
  label: string;
  shortLabel: string;
  unit: string;
  players: PlayerStat[];
}

// Sport-specific leaders data (updated periodically)
const MOCK_LEADERS: Record<string, StatCategory[]> = {
  nfl: [
    {
      key: "passing",
      label: "Passing Yards",
      shortLabel: "PASS",
      unit: "yds",
      players: [
        { playerId: "mahomes", name: "Patrick Mahomes", teamCode: "KC", teamName: "Chiefs", value: 5250, gamesPlayed: 17, rank: 1, trend: "up" },
        { playerId: "allen", name: "Josh Allen", teamCode: "BUF", teamName: "Bills", value: 4850, gamesPlayed: 17, rank: 2, trend: "up" },
        { playerId: "burrow", name: "Joe Burrow", teamCode: "CIN", teamName: "Bengals", value: 4650, gamesPlayed: 16, rank: 3, trend: "same" },
        { playerId: "stroud", name: "CJ Stroud", teamCode: "HOU", teamName: "Texans", value: 4420, gamesPlayed: 17, rank: 4, trend: "up" },
        { playerId: "hurts", name: "Jalen Hurts", teamCode: "PHI", teamName: "Eagles", value: 4200, gamesPlayed: 17, rank: 5, trend: "same" },
      ],
    },
    {
      key: "rushing",
      label: "Rushing Yards",
      shortLabel: "RUSH",
      unit: "yds",
      players: [
        { playerId: "barkley", name: "Saquon Barkley", teamCode: "PHI", teamName: "Eagles", value: 2005, gamesPlayed: 17, rank: 1, trend: "up" },
        { playerId: "henry", name: "Derrick Henry", teamCode: "BAL", teamName: "Ravens", value: 1921, gamesPlayed: 17, rank: 2, trend: "up" },
        { playerId: "gibbs", name: "Jahmyr Gibbs", teamCode: "DET", teamName: "Lions", value: 1412, gamesPlayed: 17, rank: 3, trend: "up" },
        { playerId: "robinson", name: "Bijan Robinson", teamCode: "ATL", teamName: "Falcons", value: 1350, gamesPlayed: 17, rank: 4, trend: "same" },
        { playerId: "achane", name: "De'Von Achane", teamCode: "MIA", teamName: "Dolphins", value: 1205, gamesPlayed: 14, rank: 5, trend: "up" },
      ],
    },
    {
      key: "receiving",
      label: "Receiving Yards",
      shortLabel: "REC",
      unit: "yds",
      players: [
        { playerId: "chase", name: "Ja'Marr Chase", teamCode: "CIN", teamName: "Bengals", value: 1708, gamesPlayed: 17, rank: 1, trend: "up" },
        { playerId: "nacua", name: "Puka Nacua", teamCode: "LAR", teamName: "Rams", value: 1486, gamesPlayed: 17, rank: 2, trend: "up" },
        { playerId: "lamb", name: "CeeDee Lamb", teamCode: "DAL", teamName: "Cowboys", value: 1479, gamesPlayed: 17, rank: 3, trend: "same" },
        { playerId: "brown", name: "Amon-Ra St. Brown", teamCode: "DET", teamName: "Lions", value: 1450, gamesPlayed: 17, rank: 4, trend: "up" },
        { playerId: "hill", name: "Tyreek Hill", teamCode: "MIA", teamName: "Dolphins", value: 1380, gamesPlayed: 16, rank: 5, trend: "down" },
      ],
    },
  ],
  mlb: [
    {
      key: "avg",
      label: "Batting Average",
      shortLabel: "AVG",
      unit: "avg",
      players: [
        { playerId: "arraez", name: "Luis Arraez", teamCode: "SD", teamName: "Padres", value: 0.354, gamesPlayed: 130, rank: 1, trend: "up" },
        { playerId: "ohtani", name: "Shohei Ohtani", teamCode: "LAD", teamName: "Dodgers", value: 0.328, gamesPlayed: 159, rank: 2, trend: "up" },
        { playerId: "soto", name: "Juan Soto", teamCode: "NYY", teamName: "Yankees", value: 0.315, gamesPlayed: 157, rank: 3, trend: "same" },
        { playerId: "judge", name: "Aaron Judge", teamCode: "NYY", teamName: "Yankees", value: 0.310, gamesPlayed: 158, rank: 4, trend: "up" },
        { playerId: "betts", name: "Mookie Betts", teamCode: "LAD", teamName: "Dodgers", value: 0.307, gamesPlayed: 142, rank: 5, trend: "same" },
      ],
    },
    {
      key: "hr",
      label: "Home Runs",
      shortLabel: "HR",
      unit: "hr",
      players: [
        { playerId: "judge", name: "Aaron Judge", teamCode: "NYY", teamName: "Yankees", value: 58, gamesPlayed: 158, rank: 1, trend: "up" },
        { playerId: "ohtani", name: "Shohei Ohtani", teamCode: "LAD", teamName: "Dodgers", value: 54, gamesPlayed: 159, rank: 2, trend: "up" },
        { playerId: "garcia", name: "Adolis García", teamCode: "TEX", teamName: "Rangers", value: 46, gamesPlayed: 155, rank: 3, trend: "same" },
        { playerId: "acuna", name: "Ronald Acuña Jr.", teamCode: "ATL", teamName: "Braves", value: 41, gamesPlayed: 119, rank: 4, trend: "down" },
        { playerId: "schwarber", name: "Kyle Schwarber", teamCode: "PHI", teamName: "Phillies", value: 40, gamesPlayed: 158, rank: 5, trend: "same" },
      ],
    },
    {
      key: "rbi",
      label: "Runs Batted In",
      shortLabel: "RBI",
      unit: "rbi",
      players: [
        { playerId: "ohtani", name: "Shohei Ohtani", teamCode: "LAD", teamName: "Dodgers", value: 130, gamesPlayed: 159, rank: 1, trend: "up" },
        { playerId: "judge", name: "Aaron Judge", teamCode: "NYY", teamName: "Yankees", value: 128, gamesPlayed: 158, rank: 2, trend: "up" },
        { playerId: "goldschmidt", name: "Paul Goldschmidt", teamCode: "NYY", teamName: "Yankees", value: 115, gamesPlayed: 154, rank: 3, trend: "same" },
        { playerId: "soto", name: "Juan Soto", teamCode: "NYY", teamName: "Yankees", value: 109, gamesPlayed: 157, rank: 4, trend: "up" },
        { playerId: "olson", name: "Matt Olson", teamCode: "ATL", teamName: "Braves", value: 104, gamesPlayed: 156, rank: 5, trend: "same" },
      ],
    },
  ],
  nhl: [
    {
      key: "goals",
      label: "Goals",
      shortLabel: "G",
      unit: "goals",
      players: [
        { playerId: "ovechkin", name: "Alex Ovechkin", teamCode: "WSH", teamName: "Capitals", value: 52, gamesPlayed: 82, rank: 1, trend: "up" },
        { playerId: "matthews", name: "Auston Matthews", teamCode: "TOR", teamName: "Maple Leafs", value: 50, gamesPlayed: 74, rank: 2, trend: "same" },
        { playerId: "draisaitl", name: "Leon Draisaitl", teamCode: "EDM", teamName: "Oilers", value: 48, gamesPlayed: 82, rank: 3, trend: "up" },
        { playerId: "kucherov", name: "Nikita Kucherov", teamCode: "TBL", teamName: "Lightning", value: 44, gamesPlayed: 81, rank: 4, trend: "same" },
        { playerId: "robertson", name: "Jason Robertson", teamCode: "DAL", teamName: "Stars", value: 42, gamesPlayed: 80, rank: 5, trend: "up" },
      ],
    },
    {
      key: "assists",
      label: "Assists",
      shortLabel: "A",
      unit: "assists",
      players: [
        { playerId: "mcdavid", name: "Connor McDavid", teamCode: "EDM", teamName: "Oilers", value: 100, gamesPlayed: 76, rank: 1, trend: "up" },
        { playerId: "kucherov", name: "Nikita Kucherov", teamCode: "TBL", teamName: "Lightning", value: 82, gamesPlayed: 81, rank: 2, trend: "up" },
        { playerId: "draisaitl", name: "Leon Draisaitl", teamCode: "EDM", teamName: "Oilers", value: 76, gamesPlayed: 82, rank: 3, trend: "same" },
        { playerId: "panarin", name: "Artemi Panarin", teamCode: "NYR", teamName: "Rangers", value: 72, gamesPlayed: 82, rank: 4, trend: "up" },
        { playerId: "marner", name: "Mitch Marner", teamCode: "TOR", teamName: "Maple Leafs", value: 70, gamesPlayed: 78, rank: 5, trend: "same" },
      ],
    },
    {
      key: "points",
      label: "Points",
      shortLabel: "PTS",
      unit: "pts",
      players: [
        { playerId: "mcdavid", name: "Connor McDavid", teamCode: "EDM", teamName: "Oilers", value: 152, gamesPlayed: 76, rank: 1, trend: "up" },
        { playerId: "kucherov", name: "Nikita Kucherov", teamCode: "TBL", teamName: "Lightning", value: 126, gamesPlayed: 81, rank: 2, trend: "up" },
        { playerId: "draisaitl", name: "Leon Draisaitl", teamCode: "EDM", teamName: "Oilers", value: 124, gamesPlayed: 82, rank: 3, trend: "up" },
        { playerId: "mackinnon", name: "Nathan MacKinnon", teamCode: "COL", teamName: "Avalanche", value: 118, gamesPlayed: 80, rank: 4, trend: "same" },
        { playerId: "pastrnak", name: "David Pastrňák", teamCode: "BOS", teamName: "Bruins", value: 110, gamesPlayed: 82, rank: 5, trend: "up" },
      ],
    },
  ],
  nba: [
    {
      key: "ppg",
      label: "Points Per Game",
      shortLabel: "PPG",
      unit: "ppg",
      players: [
        { playerId: "shai", name: "Shai Gilgeous-Alexander", teamCode: "OKC", teamName: "Thunder", value: 32.4, gamesPlayed: 72, rank: 1, trend: "up" },
        { playerId: "giannis", name: "Giannis Antetokounmpo", teamCode: "MIL", teamName: "Bucks", value: 31.5, gamesPlayed: 63, rank: 2, trend: "up" },
        { playerId: "jokic", name: "Nikola Jokić", teamCode: "DEN", teamName: "Nuggets", value: 29.4, gamesPlayed: 75, rank: 3, trend: "same" },
        { playerId: "luka", name: "Luka Dončić", teamCode: "DAL", teamName: "Mavericks", value: 28.1, gamesPlayed: 52, rank: 4, trend: "down" },
        { playerId: "tatum", name: "Jayson Tatum", teamCode: "BOS", teamName: "Celtics", value: 27.9, gamesPlayed: 70, rank: 5, trend: "same" },
      ],
    },
    {
      key: "rpg",
      label: "Rebounds Per Game",
      shortLabel: "RPG",
      unit: "rpg",
      players: [
        { playerId: "sabonis", name: "Domantas Sabonis", teamCode: "SAC", teamName: "Kings", value: 14.1, gamesPlayed: 75, rank: 1, trend: "up" },
        { playerId: "jokic", name: "Nikola Jokić", teamCode: "DEN", teamName: "Nuggets", value: 13.7, gamesPlayed: 75, rank: 2, trend: "same" },
        { playerId: "gobert", name: "Rudy Gobert", teamCode: "MIN", teamName: "Timberwolves", value: 12.8, gamesPlayed: 68, rank: 3, trend: "same" },
        { playerId: "giannis", name: "Giannis Antetokounmpo", teamCode: "MIL", teamName: "Bucks", value: 11.5, gamesPlayed: 63, rank: 4, trend: "up" },
        { playerId: "davis", name: "Anthony Davis", teamCode: "LAL", teamName: "Lakers", value: 11.3, gamesPlayed: 65, rank: 5, trend: "up" },
      ],
    },
    {
      key: "apg",
      label: "Assists Per Game",
      shortLabel: "APG",
      unit: "apg",
      players: [
        { playerId: "haliburton", name: "Tyrese Haliburton", teamCode: "IND", teamName: "Pacers", value: 10.9, gamesPlayed: 68, rank: 1, trend: "same" },
        { playerId: "jokic", name: "Nikola Jokić", teamCode: "DEN", teamName: "Nuggets", value: 10.6, gamesPlayed: 75, rank: 2, trend: "up" },
        { playerId: "trae", name: "Trae Young", teamCode: "ATL", teamName: "Hawks", value: 10.2, gamesPlayed: 72, rank: 3, trend: "up" },
        { playerId: "luka", name: "Luka Dončić", teamCode: "DAL", teamName: "Mavericks", value: 8.3, gamesPlayed: 52, rank: 4, trend: "down" },
        { playerId: "lebron", name: "LeBron James", teamCode: "LAL", teamName: "Lakers", value: 8.1, gamesPlayed: 68, rank: 5, trend: "same" },
      ],
    },
  ],
  golf: [
    {
      key: "fedex",
      label: "FedEx Cup Points",
      shortLabel: "FEDEX",
      unit: "pts",
      players: [
        { playerId: "scheffler", name: "Scottie Scheffler", teamCode: "USA", teamName: "USA", value: 4850, gamesPlayed: 18, rank: 1, trend: "up" },
        { playerId: "mcilroy", name: "Rory McIlroy", teamCode: "NIR", teamName: "NIR", value: 3920, gamesPlayed: 16, rank: 2, trend: "same" },
        { playerId: "rahm", name: "Jon Rahm", teamCode: "ESP", teamName: "ESP", value: 3650, gamesPlayed: 14, rank: 3, trend: "up" },
        { playerId: "koepka", name: "Brooks Koepka", teamCode: "USA", teamName: "USA", value: 3200, gamesPlayed: 15, rank: 4, trend: "down" },
        { playerId: "thomas", name: "Justin Thomas", teamCode: "USA", teamName: "USA", value: 2980, gamesPlayed: 17, rank: 5, trend: "up" },
      ],
    },
    {
      key: "scoring",
      label: "Scoring Average",
      shortLabel: "AVG",
      unit: "avg",
      players: [
        { playerId: "scheffler", name: "Scottie Scheffler", teamCode: "USA", teamName: "USA", value: 68.52, gamesPlayed: 54, rank: 1, trend: "up" },
        { playerId: "hovland", name: "Viktor Hovland", teamCode: "NOR", teamName: "NOR", value: 69.14, gamesPlayed: 48, rank: 2, trend: "same" },
        { playerId: "morikawa", name: "Collin Morikawa", teamCode: "USA", teamName: "USA", value: 69.28, gamesPlayed: 51, rank: 3, trend: "up" },
        { playerId: "mcilroy", name: "Rory McIlroy", teamCode: "NIR", teamName: "NIR", value: 69.35, gamesPlayed: 48, rank: 4, trend: "same" },
        { playerId: "rahm", name: "Jon Rahm", teamCode: "ESP", teamName: "ESP", value: 69.41, gamesPlayed: 42, rank: 5, trend: "down" },
      ],
    },
    {
      key: "earnings",
      label: "Season Earnings",
      shortLabel: "$$$",
      unit: "earnings",
      players: [
        { playerId: "scheffler", name: "Scottie Scheffler", teamCode: "USA", teamName: "USA", value: 28500000, gamesPlayed: 18, rank: 1, trend: "up" },
        { playerId: "mcilroy", name: "Rory McIlroy", teamCode: "NIR", teamName: "NIR", value: 18200000, gamesPlayed: 16, rank: 2, trend: "up" },
        { playerId: "rahm", name: "Jon Rahm", teamCode: "ESP", teamName: "ESP", value: 15800000, gamesPlayed: 14, rank: 3, trend: "same" },
        { playerId: "clark", name: "Wyndham Clark", teamCode: "USA", teamName: "USA", value: 12400000, gamesPlayed: 17, rank: 4, trend: "up" },
        { playerId: "koepka", name: "Brooks Koepka", teamCode: "USA", teamName: "USA", value: 11900000, gamesPlayed: 15, rank: 5, trend: "down" },
      ],
    },
  ],
  mma: [
    {
      key: "p4p",
      label: "Pound-for-Pound",
      shortLabel: "P4P",
      unit: "rank",
      players: [
        { playerId: "makhachev", name: "Islam Makhachev", teamCode: "LW", teamName: "Lightweight", value: 1, gamesPlayed: 26, rank: 1, trend: "up" },
        { playerId: "jones", name: "Jon Jones", teamCode: "HW", teamName: "Heavyweight", value: 2, gamesPlayed: 28, rank: 2, trend: "same" },
        { playerId: "duplesis", name: "Dricus du Plessis", teamCode: "MW", teamName: "Middleweight", value: 3, gamesPlayed: 22, rank: 3, trend: "up" },
        { playerId: "topuria", name: "Ilia Topuria", teamCode: "FW", teamName: "Featherweight", value: 4, gamesPlayed: 15, rank: 4, trend: "up" },
        { playerId: "pantoja", name: "Alexandre Pantoja", teamCode: "FLW", teamName: "Flyweight", value: 5, gamesPlayed: 28, rank: 5, trend: "same" },
      ],
    },
    {
      key: "wins",
      label: "Win Streak",
      shortLabel: "STREAK",
      unit: "wins",
      players: [
        { playerId: "makhachev", name: "Islam Makhachev", teamCode: "LW", teamName: "Lightweight", value: 14, gamesPlayed: 26, rank: 1, trend: "up" },
        { playerId: "shavkat", name: "Shavkat Rakhmonov", teamCode: "WW", teamName: "Welterweight", value: 18, gamesPlayed: 18, rank: 2, trend: "up" },
        { playerId: "aspinall", name: "Tom Aspinall", teamCode: "HW", teamName: "Heavyweight", value: 6, gamesPlayed: 15, rank: 3, trend: "up" },
        { playerId: "volkov", name: "Alexander Volkov", teamCode: "HW", teamName: "Heavyweight", value: 5, gamesPlayed: 42, rank: 4, trend: "same" },
        { playerId: "ankalaev", name: "Magomed Ankalaev", teamCode: "LHW", teamName: "Light Heavyweight", value: 12, gamesPlayed: 20, rank: 5, trend: "up" },
      ],
    },
    {
      key: "ko",
      label: "KO/TKO Finishes",
      shortLabel: "KO",
      unit: "finishes",
      players: [
        { playerId: "pereira", name: "Alex Pereira", teamCode: "LHW", teamName: "Light Heavyweight", value: 9, gamesPlayed: 12, rank: 1, trend: "up" },
        { playerId: "aspinall", name: "Tom Aspinall", teamCode: "HW", teamName: "Heavyweight", value: 10, gamesPlayed: 15, rank: 2, trend: "up" },
        { playerId: "ngannou", name: "Francis Ngannou", teamCode: "HW", teamName: "Heavyweight", value: 12, gamesPlayed: 20, rank: 3, trend: "same" },
        { playerId: "topuria", name: "Ilia Topuria", teamCode: "FW", teamName: "Featherweight", value: 8, gamesPlayed: 15, rank: 4, trend: "up" },
        { playerId: "strickland", name: "Sean Strickland", teamCode: "MW", teamName: "Middleweight", value: 6, gamesPlayed: 32, rank: 5, trend: "same" },
      ],
    },
  ],
};

// Format stat values based on unit type
function formatStatValue(value: number, unit: string): string {
  switch (unit) {
    case 'avg':
      // Golf scoring average or batting average
      return value >= 50 ? value.toFixed(2) : value.toFixed(3).slice(1);
    case 'earnings':
      // Format as currency (millions)
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
      }
      return `$${value.toLocaleString()}`;
    case 'rank':
      // P4P ranking - show as #1, #2, etc.
      return `#${Math.round(value)}`;
    case 'wins':
    case 'finishes':
    case 'hr':
    case 'rbi':
    case 'goals':
    case 'assists':
    case 'pts':
    case 'yds':
      return Math.round(value).toLocaleString();
    default:
      return value.toFixed(1);
  }
}

// Format unit labels for display
function formatUnitLabel(unit: string): string {
  switch (unit) {
    case 'earnings': return 'earned';
    case 'rank': return 'P4P';
    case 'wins': return 'win streak';
    case 'finishes': return 'KO/TKO';
    default: return unit;
  }
}

interface HubLeadersProps {
  sportKey: string;
}

interface LivePropRow {
  player_id?: string;
  player_name?: string;
  team?: string;
  sport?: string;
  prop_type?: string;
  line_value?: number | string;
}

function normalizePropType(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}

function buildNbaLeadersFromProps(props: LivePropRow[]): StatCategory[] {
  const categories = [
    {
      key: "ppg",
      label: "Points Lines",
      shortLabel: "PTS",
      unit: "ppg",
      matches: (type: string) => type.includes("POINTS") && !type.includes("ASSISTS") && !type.includes("REBOUNDS"),
    },
    {
      key: "rpg",
      label: "Rebounds Lines",
      shortLabel: "REB",
      unit: "rpg",
      matches: (type: string) => type.includes("REBOUNDS") && !type.includes("ASSISTS"),
    },
    {
      key: "apg",
      label: "Assists Lines",
      shortLabel: "AST",
      unit: "apg",
      matches: (type: string) => type.includes("ASSISTS") && !type.includes("REBOUNDS"),
    },
  ];

  return categories.map((category) => {
    const byPlayer = new Map<string, { playerId: string; name: string; team: string; total: number; count: number }>();

    for (const prop of props) {
      const type = normalizePropType(String(prop.prop_type || ""));
      if (!category.matches(type)) continue;
      const rawLine = Number(prop.line_value);
      if (!Number.isFinite(rawLine)) continue;

      const playerName = String(prop.player_name || "").trim();
      if (!playerName) continue;
      const playerId = String(prop.player_id || `${playerName}-${prop.team || "TEAM"}`);
      const team = String(prop.team || "NBA");
      const key = `${playerId}::${team}`;
      const prev = byPlayer.get(key);

      if (prev) {
        prev.total += rawLine;
        prev.count += 1;
      } else {
        byPlayer.set(key, { playerId, name: playerName, team, total: rawLine, count: 1 });
      }
    }

    const players = Array.from(byPlayer.values())
      .map((entry) => ({
        playerId: entry.playerId,
        name: entry.name,
        teamCode: entry.team,
        teamName: entry.team,
        value: entry.total / Math.max(1, entry.count),
        gamesPlayed: 0,
        sampleSize: entry.count,
        rank: 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((player, idx) => ({ ...player, rank: idx + 1 }));

    return {
      key: category.key,
      label: category.label,
      shortLabel: category.shortLabel,
      unit: category.unit,
      players,
    };
  });
}

export function HubLeaders({ sportKey }: HubLeadersProps) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [liveNbaCategories, setLiveNbaCategories] = useState<StatCategory[] | null>(null);
  const [liveNbaLoading, setLiveNbaLoading] = useState(false);
  const [liveNbaError, setLiveNbaError] = useState<string | null>(null);

  useEffect(() => {
    if (sportKey !== "nba") {
      setLiveNbaCategories(null);
      setLiveNbaError(null);
      setLiveNbaLoading(false);
      return;
    }

    let mounted = true;
    setLiveNbaLoading(true);
    setLiveNbaError(null);

    fetch("/api/sports-data/props/today", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const nbaProps = Array.isArray(data?.props)
          ? data.props.filter((row: LivePropRow) => String(row.sport || "").toUpperCase() === "NBA")
          : [];
        const built = buildNbaLeadersFromProps(nbaProps);
        if (mounted) setLiveNbaCategories(built);
      })
      .catch((err) => {
        if (mounted) {
          console.error("[HubLeaders] Failed to fetch NBA live leaders:", err);
          setLiveNbaError("Live NBA leader lines are currently unavailable.");
          setLiveNbaCategories([]);
        }
      })
      .finally(() => {
        if (mounted) setLiveNbaLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [sportKey]);

  const categories = useMemo(() => {
    if (sportKey === "nba") {
      return liveNbaCategories || [];
    }
    return MOCK_LEADERS[sportKey] || [];
  }, [liveNbaCategories, sportKey]);

  useEffect(() => {
    if (activeCategory >= categories.length) {
      setActiveCategory(0);
    }
  }, [activeCategory, categories.length]);

  if (sportKey === "nba" && liveNbaLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-8 text-center">
        <p className="text-sm text-white/60">Loading live NBA leader lines...</p>
      </div>
    );
  }

  if (sportKey === "nba" && (liveNbaError || categories.length === 0)) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-8 text-center">
        <h3 className="text-lg font-semibold text-white/90 mb-2">Live NBA Leaders Unavailable</h3>
        <p className="text-white/50 text-sm max-w-xs mx-auto">
          {liveNbaError || "No live NBA props were returned for the current slate."}
        </p>
      </div>
    );
  }

  // Show coming soon message for sports without data
  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--sport-accent)]/5 via-transparent to-transparent p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-4">
          <Sparkles className="h-7 w-7 text-[var(--sport-accent)]/50" />
        </div>
        <h3 className="text-lg font-semibold text-white/80 mb-2">
          Player Stats Coming Soon
        </h3>
        <p className="text-white/40 text-sm max-w-xs mx-auto">
          We're working on bringing you live player statistics and league leaders.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category Tabs */}
      <div className="flex items-center gap-2">
        {categories.map((cat, idx) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(idx)}
            className={`px-4 py-3 sm:py-2 rounded-xl text-sm font-bold transition-all min-h-[44px] active:scale-95 ${
              idx === activeCategory
                ? 'bg-[var(--sport-accent)]/20 text-[var(--sport-accent)] border border-[var(--sport-accent)]/30'
                : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
            }`}
          >
            {cat.shortLabel}
          </button>
        ))}
      </div>

      {/* Leaders Display */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-400" />
              <span className="font-bold text-white text-sm">{categories[activeCategory].label}</span>
            </div>
          </div>
        </div>

        {/* Player Cards - Horizontal Scroll */}
        <div className="p-4">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
            {categories[activeCategory].players.map((player, index) => (
              <PlayerCard 
                key={player.playerId}
                player={player}
                index={index}
                sportKey={sportKey}
                unit={categories[activeCategory].unit}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats Grid - Top 3 across categories */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {categories.map((cat, catIdx) => {
          const leader = cat.players[0];
          return (
            <QuickStatCard 
              key={cat.key}
              category={cat}
              leader={leader}
              isActive={catIdx === activeCategory}
              onClick={() => setActiveCategory(catIdx)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface PlayerCardProps {
  player: PlayerStat;
  index: number;
  sportKey: string;
  unit: string;
}

function PlayerCard({ player, index, sportKey, unit }: PlayerCardProps) {
  const isFirst = player.rank === 1;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="snap-start"
    >
      <div
        className={`block w-[160px] sm:w-[200px] rounded-xl border transition-all group ${
          isFirst 
            ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent' 
            : 'border-white/10 bg-white/[0.02]'
        }`}
      >
        {/* Rank Badge */}
        <div className="p-3 pb-0 flex justify-between items-start">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
            isFirst 
              ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-black' 
              : player.rank <= 3
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-white/50'
          }`}>
            {player.rank}
          </div>
          
          {player.trend && (
            <TrendIndicator trend={player.trend} />
          )}
        </div>

        {/* Player Info */}
        <div className="p-3 pt-2 text-center">
          {/* Player Photo or Silhouette Fallback */}
          <div className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-full flex items-center justify-center text-lg font-bold mb-2 overflow-hidden ${
            isFirst 
              ? 'ring-2 ring-amber-500/30' 
              : ''
          }`}>
            <PlayerPhoto
              playerName={player.name}
              sport={sportKey}
              size={64}
              highlight={isFirst}
            />
          </div>

          {/* Name */}
          <div className="font-semibold text-white text-sm truncate group-hover:text-[var(--sport-accent)] transition-colors">
            {player.name.split(' ').slice(-1)[0]}
          </div>
          
          {/* Team */}
          <div className="text-[10px] text-white/40 mt-0.5">
            {player.teamName}
          </div>

          {/* Stat Value */}
          <div className={`mt-2 text-xl sm:text-2xl font-bold tabular-nums ${
            isFirst ? 'text-amber-400' : 'text-white'
          }`}>
            {formatStatValue(player.value, unit)}
          </div>
          <div className="text-[10px] text-white/30 uppercase tracking-wider">
            {formatUnitLabel(unit)}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-white/5 flex justify-center">
          <span className="text-[10px] text-white/30">
            {player.sampleSize ? `${player.sampleSize} markets` : `${player.gamesPlayed} GP`}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function TrendIndicator({ trend }: { trend: "up" | "down" | "same" }) {
  if (trend === "up") {
    return (
      <div className="flex items-center gap-0.5 text-emerald-400">
        <TrendingUp className="h-3 w-3" />
        <Flame className="h-3 w-3" />
      </div>
    );
  }
  if (trend === "down") {
    return (
      <div className="text-red-400/60">
        <TrendingUp className="h-3 w-3 rotate-180" />
      </div>
    );
  }
  return null;
}

interface QuickStatCardProps {
  category: StatCategory;
  leader: PlayerStat;
  isActive: boolean;
  onClick: () => void;
}

function QuickStatCard({ category, leader, isActive, onClick }: QuickStatCardProps) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-all ${
        isActive 
          ? 'border-[var(--sport-accent)]/30 bg-[var(--sport-accent)]/10' 
          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
      }`}
    >
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
        {category.shortLabel} Leader
      </div>
      <div className="font-semibold text-white text-sm truncate">
        {leader.name.split(' ').slice(-1)[0]}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className={`text-lg font-bold ${isActive ? 'text-[var(--sport-accent)]' : 'text-white'}`}>
          {formatStatValue(leader.value, category.unit)}
        </span>
        <span className="text-[10px] text-white/30">{formatUnitLabel(category.unit)}</span>
      </div>
    </button>
  );
}

export default HubLeaders;
