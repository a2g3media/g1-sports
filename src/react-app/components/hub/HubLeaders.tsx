import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Award, Flame, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
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
  league?: string | null;
  sampleValue?: number | string | null;
  sampleLabel?: string | null;
}

interface StatCategory {
  key: string;
  label: string;
  shortLabel: string;
  unit: string;
  statGroup?: "hitting" | "pitching";
  qualifierLabel?: string;
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
    {
      key: "spg",
      label: "Steals Per Game",
      shortLabel: "STL",
      unit: "spg",
      players: [
        { playerId: "shai", name: "Shai Gilgeous-Alexander", teamCode: "OKC", teamName: "Thunder", value: 2.1, gamesPlayed: 72, rank: 1, trend: "up" },
        { playerId: "fox", name: "De'Aaron Fox", teamCode: "SAC", teamName: "Kings", value: 1.9, gamesPlayed: 74, rank: 2, trend: "same" },
        { playerId: "caruso", name: "Alex Caruso", teamCode: "CHI", teamName: "Bulls", value: 1.8, gamesPlayed: 70, rank: 3, trend: "up" },
        { playerId: "butler", name: "Jimmy Butler", teamCode: "MIA", teamName: "Heat", value: 1.7, gamesPlayed: 64, rank: 4, trend: "same" },
        { playerId: "herb", name: "Herb Jones", teamCode: "NOP", teamName: "Pelicans", value: 1.6, gamesPlayed: 71, rank: 5, trend: "same" },
      ],
    },
    {
      key: "bpg",
      label: "Blocks Per Game",
      shortLabel: "BLK",
      unit: "bpg",
      players: [
        { playerId: "wemby", name: "Victor Wembanyama", teamCode: "SAS", teamName: "Spurs", value: 3.6, gamesPlayed: 71, rank: 1, trend: "up" },
        { playerId: "turner", name: "Myles Turner", teamCode: "IND", teamName: "Pacers", value: 2.3, gamesPlayed: 73, rank: 2, trend: "same" },
        { playerId: "lopez", name: "Brook Lopez", teamCode: "MIL", teamName: "Bucks", value: 2.2, gamesPlayed: 74, rank: 3, trend: "same" },
        { playerId: "davis", name: "Anthony Davis", teamCode: "LAL", teamName: "Lakers", value: 2.1, gamesPlayed: 65, rank: 4, trend: "up" },
        { playerId: "chet", name: "Chet Holmgren", teamCode: "OKC", teamName: "Thunder", value: 2.0, gamesPlayed: 76, rank: 5, trend: "up" },
      ],
    },
    {
      key: "tpg",
      label: "Three-Pointers Made",
      shortLabel: "3PM",
      unit: "tpg",
      players: [
        { playerId: "curry", name: "Stephen Curry", teamCode: "GSW", teamName: "Warriors", value: 4.8, gamesPlayed: 70, rank: 1, trend: "up" },
        { playerId: "lillard", name: "Damian Lillard", teamCode: "MIL", teamName: "Bucks", value: 3.7, gamesPlayed: 73, rank: 2, trend: "same" },
        { playerId: "donovan", name: "Donovan Mitchell", teamCode: "CLE", teamName: "Cavaliers", value: 3.5, gamesPlayed: 62, rank: 3, trend: "up" },
        { playerId: "thompson", name: "Klay Thompson", teamCode: "GSW", teamName: "Warriors", value: 3.4, gamesPlayed: 75, rank: 4, trend: "down" },
        { playerId: "luka", name: "Luka Dončić", teamCode: "DAL", teamName: "Mavericks", value: 3.3, gamesPlayed: 70, rank: 5, trend: "same" },
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
    case 'era':
    case 'whip':
      return value.toFixed(2);
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
    case 'w':
    case 'finishes':
    case 'hr':
    case 'rbi':
    case 'hits':
    case 'so':
    case 'saves':
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
    case 'w': return 'W';
    case 'so': return 'K';
    case 'saves': return 'SV';
    case 'finishes': return 'KO/TKO';
    case 'spg': return 'STL';
    case 'bpg': return 'BLK';
    case 'tpg': return '3PM';
    default: return unit;
  }
}

function getDisplayLastName(name: string): string {
  const safe = String(name || '').trim();
  if (!safe) return 'Player';
  const stripSuffix = (value: string) =>
    value.replace(/\b(JR|SR|II|III|IV|V)\b\.?/gi, '').replace(/\s+/g, ' ').trim();

  if (safe.includes(',')) {
    const [lastPart] = safe.split(',', 1);
    const normalizedLast = stripSuffix(lastPart || '');
    return normalizedLast || 'Player';
  }

  const tokens = stripSuffix(safe).split(' ').filter(Boolean);
  return tokens[tokens.length - 1] || safe;
}

interface HubLeadersProps {
  sportKey: string;
}

interface LeadersApiCategory {
  key?: string;
  label?: string;
  shortLabel?: string;
  unit?: string;
  statGroup?: "hitting" | "pitching";
  qualifierLabel?: string;
  players?: Array<{
    playerId?: string;
    name?: string;
    teamCode?: string;
    teamName?: string;
    value?: number;
    gamesPlayed?: number;
    rank?: number;
    imageUrl?: string | null;
    league?: string | null;
    sampleValue?: number | string | null;
    sampleLabel?: string | null;
  }>;
}

const NBA_LIVE_FETCH_TIMEOUT_MS = 4200;

function parseLeadersApiCategories(categoriesRaw: LeadersApiCategory[]): StatCategory[] {
  return categoriesRaw.map((cat) => ({
    key: String(cat.key || "leader"),
    label: String(cat.label || "Leader"),
    shortLabel: String(cat.shortLabel || cat.key || "LDR"),
    unit: String(cat.unit || "stat"),
    players: Array.isArray(cat.players)
      ? cat.players
        .map((player, idx) => ({
          playerId: String(player.playerId || `${cat.key || "leader"}-${idx}`),
          name: String(player.name || "Unknown Player"),
          teamCode: String(player.teamCode || ""),
          teamName: String(player.teamName || ""),
          value: Number(player.value ?? 0),
          gamesPlayed: Number(player.gamesPlayed ?? 0),
          rank: Number(player.rank ?? idx + 1),
          imageUrl: typeof player.imageUrl === "string" ? player.imageUrl : undefined,
          league: typeof player.league === "string" ? player.league : null,
          sampleValue: player.sampleValue ?? null,
          sampleLabel: typeof player.sampleLabel === "string" ? player.sampleLabel : null,
        }))
        .filter((player) => Number.isFinite(player.value))
      : [],
    statGroup: (cat.statGroup === "pitching" ? "pitching" : cat.statGroup === "hitting" ? "hitting" : undefined) as "hitting" | "pitching" | undefined,
    qualifierLabel: typeof cat.qualifierLabel === "string" ? cat.qualifierLabel : undefined,
  })).filter((cat) => cat.players.length > 0);
}

export function HubLeaders({ sportKey }: HubLeadersProps) {
  const sportKeyLower = String(sportKey || "").toLowerCase();
  const [activeCategory, setActiveCategory] = useState(0);
  const [activeMlbGroup, setActiveMlbGroup] = useState<"hitting" | "pitching">("hitting");
  const [activeMlbLeague, setActiveMlbLeague] = useState<"all" | "AL" | "NL">("all");
  const [liveSportCategories, setLiveSportCategories] = useState<StatCategory[] | null>(null);
  const [liveSportLoading, setLiveSportLoading] = useState(false);
  const [nbaMode, setNbaMode] = useState<"season" | "live">("season");
  const [nbaLeadersSource, setNbaLeadersSource] = useState<"live" | "cached" | "fallback">("fallback");
  const isLivePropsSport = sportKeyLower === "nba";
  const nbaCacheKey = `hub:nba:leaders:${nbaMode}:v2`;
  const nbaLiveCacheKey = "hub:nba:leaders:live:v2";

  useEffect(() => {
    if (!isLivePropsSport) {
      return;
    }

    let mounted = true;
    let hasWarmCache = false;
    try {
      const cachedRaw = sessionStorage.getItem(nbaCacheKey);
      const cached = cachedRaw ? JSON.parse(cachedRaw) as StatCategory[] : [];
      const cacheRows = Array.isArray(cached) ? cached : [];
      if (cacheRows.length > 0) {
        hasWarmCache = true;
        setLiveSportCategories(cacheRows);
        setNbaLeadersSource("cached");
      }
    } catch {
      // ignore cache parse failures
    }
    setLiveSportLoading(!hasWarmCache);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NBA_LIVE_FETCH_TIMEOUT_MS);

    fetch(`/api/teams/NBA/leaders?limit=5&mode=${nbaMode}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const categoriesRaw = Array.isArray(data?.categories) ? data.categories as LeadersApiCategory[] : [];
        const parsed = parseLeadersApiCategories(categoriesRaw);
        if (parsed.length > 0) {
          try {
            sessionStorage.setItem(nbaCacheKey, JSON.stringify(parsed));
          } catch {
            // ignore storage failures
          }
        }
        if (mounted) {
          if (parsed.length > 0) {
            setLiveSportCategories(parsed);
            setNbaLeadersSource("live");
          } else if (!hasWarmCache) {
            try {
              const cachedRaw = sessionStorage.getItem(nbaCacheKey);
              const cached = cachedRaw ? JSON.parse(cachedRaw) as StatCategory[] : [];
              const cacheRows = Array.isArray(cached) ? cached : [];
              setLiveSportCategories(cacheRows);
              setNbaLeadersSource(cacheRows.length > 0 ? "cached" : "fallback");
            } catch {
              setLiveSportCategories([]);
              setNbaLeadersSource("fallback");
            }
          }
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error(`[HubLeaders] Failed to fetch ${sportKeyLower.toUpperCase()} live leaders:`, err);
          if (!hasWarmCache) {
            try {
              const cachedRaw = sessionStorage.getItem(nbaCacheKey);
              const cached = cachedRaw ? JSON.parse(cachedRaw) as StatCategory[] : [];
              const cacheRows = Array.isArray(cached) ? cached : [];
              setLiveSportCategories(cacheRows);
              setNbaLeadersSource(cacheRows.length > 0 ? "cached" : "fallback");
            } catch {
              setLiveSportCategories([]);
              setNbaLeadersSource("fallback");
            }
          } else {
            setNbaLeadersSource("cached");
          }
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        if (mounted) setLiveSportLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [isLivePropsSport, nbaCacheKey, nbaMode, sportKeyLower]);

  // Warm live cache in the background while season mode is visible.
  useEffect(() => {
    if (!isLivePropsSport || nbaMode !== "season") return;
    try {
      const existing = sessionStorage.getItem(nbaLiveCacheKey);
      if (existing) return;
    } catch {
      // ignore storage read failures
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NBA_LIVE_FETCH_TIMEOUT_MS);
    fetch("/api/teams/NBA/leaders?limit=5&mode=live", {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const categoriesRaw = Array.isArray(data?.categories) ? data.categories as LeadersApiCategory[] : [];
        const parsed = parseLeadersApiCategories(categoriesRaw);
        if (parsed.length > 0) {
          try {
            sessionStorage.setItem(nbaLiveCacheKey, JSON.stringify(parsed));
          } catch {
            // ignore storage failures
          }
        }
      })
      .catch(() => {
        // silent prefetch failure
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [isLivePropsSport, nbaLiveCacheKey, nbaMode]);

  useEffect(() => {
    if (sportKeyLower !== "mlb") {
      if (!isLivePropsSport) {
        setLiveSportCategories(null);
        setLiveSportLoading(false);
      }
      return;
    }

    let mounted = true;
    setLiveSportLoading(true);

    fetch("/api/teams/MLB/leaders?limit=5", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const categoriesRaw = Array.isArray(data?.categories) ? data.categories as LeadersApiCategory[] : [];
        const parsed: StatCategory[] = categoriesRaw.map((cat) => ({
          key: String(cat.key || "leader"),
          label: String(cat.label || "Leader"),
          shortLabel: String(cat.shortLabel || cat.key || "LDR"),
          unit: String(cat.unit || "stat"),
          players: Array.isArray(cat.players)
            ? cat.players
              .map((player, idx) => ({
                playerId: String(player.playerId || `${cat.key || "leader"}-${idx}`),
                name: String(player.name || "Unknown Player"),
                teamCode: String(player.teamCode || ""),
                teamName: String(player.teamName || ""),
                value: Number(player.value ?? 0),
                gamesPlayed: Number(player.gamesPlayed ?? 0),
                rank: Number(player.rank ?? idx + 1),
                imageUrl: typeof player.imageUrl === "string" ? player.imageUrl : undefined,
                league: typeof player.league === "string" ? player.league : null,
                sampleValue: player.sampleValue ?? null,
                sampleLabel: typeof player.sampleLabel === "string" ? player.sampleLabel : null,
              }))
              .filter((player) => Number.isFinite(player.value))
            : [],
          statGroup: cat.statGroup === "pitching" ? "pitching" : "hitting",
          qualifierLabel: typeof cat.qualifierLabel === "string" ? cat.qualifierLabel : undefined,
        }));
        if (mounted) setLiveSportCategories(parsed);
      })
      .catch((err) => {
        if (mounted) {
          console.error("[HubLeaders] Failed to fetch MLB leaders:", err);
          setLiveSportCategories([]);
        }
      })
      .finally(() => {
        if (mounted) setLiveSportLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isLivePropsSport, sportKeyLower]);

  const categories = useMemo(() => {
    const hasRenderableLive = Boolean(
      liveSportCategories?.some((cat) => Array.isArray(cat.players) && cat.players.length > 0),
    );
    if (sportKeyLower === "nba") {
      const liveOrCache = hasRenderableLive ? (liveSportCategories || []) : [];
      return liveOrCache.filter((cat) => Array.isArray(cat.players) && cat.players.length > 0);
    }
    const source =
      sportKeyLower === "mlb"
        ? (hasRenderableLive ? liveSportCategories || [] : (MOCK_LEADERS[sportKeyLower] || []))
        : (isLivePropsSport ? (liveSportCategories || []) : (MOCK_LEADERS[sportKeyLower] || []));
    // Guardrail: avoid rendering empty category shells that can crash quick cards.
    return source.filter((cat) => Array.isArray(cat.players) && cat.players.length > 0);
  }, [isLivePropsSport, liveSportCategories, nbaMode, sportKeyLower]);
  const visibleCategories = useMemo(() => {
    if (sportKeyLower !== "mlb") return categories;
    const grouped = categories.filter((cat) => (cat.statGroup || "hitting") === activeMlbGroup);
    const leagueFiltered = grouped
      .map((cat) => ({
        ...cat,
        players: activeMlbLeague === "all"
          ? cat.players
          : cat.players.filter((player) => String(player.league || "").toUpperCase() === activeMlbLeague),
      }))
      .filter((cat) => cat.players.length > 0);
    return leagueFiltered.length > 0 ? leagueFiltered : grouped;
  }, [activeMlbGroup, activeMlbLeague, categories, sportKeyLower]);
  const leadersSource: "season" | "live" | "cached" | "fallback" | "static" = useMemo(() => {
    const hasRenderableLive = Boolean(
      liveSportCategories?.some((cat) => Array.isArray(cat.players) && cat.players.length > 0),
    );
    if (sportKeyLower === "mlb") {
      return hasRenderableLive ? "live" : "fallback";
    }
    if (sportKeyLower === "nba") {
      if (nbaMode === "season") return "season";
      if (!hasRenderableLive) return "fallback";
      return nbaLeadersSource;
    }
    return "static";
  }, [liveSportCategories, nbaLeadersSource, nbaMode, sportKeyLower]);
  const leadersSourceLabel = useMemo(() => {
    if (sportKeyLower === "nba") {
      if (leadersSource === "season") return nbaLeadersSource === "cached" ? "season cache" : "season live";
      if (leadersSource === "live") return "live";
      if (leadersSource === "cached") return "live cache";
      if (leadersSource === "fallback") return "unavailable";
    }
    return leadersSource;
  }, [leadersSource, nbaLeadersSource, sportKeyLower]);

  useEffect(() => {
    if (activeCategory >= visibleCategories.length) {
      setActiveCategory(0);
    }
  }, [activeCategory, visibleCategories.length]);

  if (isLivePropsSport && liveSportLoading && categories.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-8 text-center">
        <p className="text-sm text-white/60">
          Loading {nbaMode === "season" ? "season" : "live"} {sportKey.toUpperCase()} leader lines...
        </p>
      </div>
    );
  }

  if (sportKeyLower === "mlb" && liveSportLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-8 text-center">
        <p className="text-sm text-white/60">Loading live MLB leaders...</p>
      </div>
    );
  }

  // Show coming soon message for sports without data
  if (categories.length === 0) {
    if (sportKeyLower === "nba") {
      return (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-8 text-center">
          <h3 className="text-lg font-semibold text-white/90 mb-2">NBA leaders temporarily unavailable</h3>
          <p className="text-white/50 text-sm max-w-xs mx-auto">
            We could not load current {nbaMode} leaders right now. Try refreshing shortly.
          </p>
        </div>
      );
    }
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

  const activeCategoryData = visibleCategories[activeCategory] || visibleCategories[0];
  if (!activeCategoryData) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-8 text-center">
        <p className="text-white/50 text-sm">Leaderboard data is temporarily unavailable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category Controls */}
      <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/55">
          <span>Leaders</span>
          <span className={
            leadersSource === "season"
              ? "text-violet-300"
              :
            leadersSource === "live"
              ? "text-emerald-400"
              : leadersSource === "cached"
                ? "text-sky-300"
              : leadersSource === "fallback"
                ? "text-amber-300"
                : "text-cyan-300"
          }>
            {leadersSourceLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
        {visibleCategories.map((cat, idx) => (
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
      </div>
      {sportKeyLower === "nba" && (
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          <button
            onClick={() => {
              setNbaMode("season");
              setActiveCategory(0);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              nbaMode === "season"
                ? "bg-violet-500/20 text-violet-300 border border-violet-400/30"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Season
          </button>
          <button
            onClick={() => {
              setNbaMode("live");
              setActiveCategory(0);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              nbaMode === "live"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Live
          </button>
        </div>
      )}
      {sportKeyLower === "mlb" && (
        <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          <button
            onClick={() => {
              setActiveMlbGroup("hitting");
              setActiveCategory(0);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              activeMlbGroup === "hitting"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Hitting
          </button>
          <button
            onClick={() => {
              setActiveMlbGroup("pitching");
              setActiveCategory(0);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              activeMlbGroup === "pitching"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Pitching
          </button>
        </div>
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["all", "AL", "NL"] as const).map((league) => (
            <button
              key={league}
              onClick={() => {
                setActiveMlbLeague(league);
                setActiveCategory(0);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                activeMlbLeague === league
                  ? "bg-violet-500/20 text-violet-300 border border-violet-400/30"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              {league === "all" ? "All Leagues" : league}
            </button>
          ))}
        </div>
        </div>
      )}
      </div>

      {/* Leaders Display */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-400" />
              <span className="font-bold text-white text-sm">{activeCategoryData.label}</span>
              {activeCategoryData.qualifierLabel ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {activeCategoryData.qualifierLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Player Cards - Horizontal Scroll */}
        <div className="p-4">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
            {activeCategoryData.players.map((player, index) => (
              <PlayerCard 
                key={player.playerId}
                player={player}
                index={index}
                sportKey={sportKey}
                unit={activeCategoryData.unit}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats Grid - Top 3 across categories */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {visibleCategories.map((cat, catIdx) => {
          const leader = cat.players[0];
          return (
            <QuickStatCard 
              key={cat.key}
              category={cat}
              leader={leader}
              sportKey={sportKey}
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
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const playerPath = `/props/player/${String(sportKey || "").toUpperCase()}/${encodeURIComponent(player.name)}`;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="snap-start"
    >
      <Link
        to={playerPath}
        className={`block w-[160px] sm:w-[200px] rounded-xl border transition-all group ${
          isFirst 
            ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent' 
            : 'border-white/10 bg-white/[0.02] hover:border-white/25'
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
          <div className={`w-[72px] h-[80px] sm:w-[88px] sm:h-[96px] mx-auto rounded-2xl flex items-center justify-center text-lg font-bold mb-2 overflow-hidden bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 ${
            isFirst 
              ? 'ring-2 ring-amber-500/30' 
              : ''
          }`}>
            {!headshotFailed && player.imageUrl ? (
              <img
                src={player.imageUrl}
                alt={player.name}
                className="object-contain object-center rounded-2xl p-1"
                style={{ width: "100%", height: "100%" }}
                onError={() => setHeadshotFailed(true)}
                loading="lazy"
              />
            ) : (
              <PlayerPhoto
                playerName={player.name}
                sport={sportKey}
                size={92}
                highlight={isFirst}
                shape="rounded"
                className="object-contain object-center p-1"
              />
            )}
          </div>

          {/* Name */}
          <div className="font-semibold text-white text-sm truncate group-hover:text-[var(--sport-accent)] transition-colors">
            {getDisplayLastName(player.name)}
          </div>
          
          {/* Team */}
          <div className="text-[10px] text-white/40 mt-0.5">
            {player.teamName}
          </div>
          {player.league ? (
            <div className="text-[10px] text-white/30 mt-0.5">{player.league}</div>
          ) : null}

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
            {player.sampleValue != null && player.sampleLabel
              ? `${player.sampleValue} ${player.sampleLabel}`
              : player.sampleSize
                ? `${player.sampleSize} markets`
                : `${player.gamesPlayed} GP`}
          </span>
        </div>
      </Link>
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
  leader?: PlayerStat;
  sportKey: string;
  isActive: boolean;
  onClick: () => void;
}

function QuickStatCard({ category, leader, sportKey, isActive, onClick }: QuickStatCardProps) {
  if (!leader) return null;
  const playerPath = `/props/player/${String(sportKey || "").toUpperCase()}/${encodeURIComponent(leader.name)}`;
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
      <Link
        to={playerPath}
        onClick={(event) => event.stopPropagation()}
        className="font-semibold text-white text-sm truncate hover:text-[var(--sport-accent)] transition-colors"
      >
        {getDisplayLastName(leader.name)}
      </Link>
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
