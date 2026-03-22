import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Calendar, Users, Sparkles, MapPin, Flag, Clock, DollarSign, ChevronRight, AlertCircle, Star, TrendingUp, Zap, Target, ArrowLeft, Award, Crown, Search, User, X, BarChart3, Globe, Check } from "lucide-react";
import { GolfLeaderboard } from "@/react-app/components/hub/GolfLeaderboard";
import { CoachCommandCard } from "@/react-app/components/hub/CoachCommandCard";

interface Tournament {
  id: string;
  name: string;
  course: string;
  location: string;
  purse: number;
  currency: string;
  startDate: string;
  endDate?: string;
  status: string;
  currentRound?: number | null;
  defendingChamp?: string | null;
  isLive?: boolean;
}

interface GolfScheduleData {
  season: number;
  current?: Tournament;
  upcoming: Tournament[];
  completed: { id: string; name: string; startDate: string; endDate: string; course: string; purse: number; winner?: string; winningScore?: number }[];
}

// Top golfers for display
const TOP_GOLFERS = [
  { name: "Scottie Scheffler", country: "USA", rank: 1 },
  { name: "Rory McIlroy", country: "NIR", rank: 2 },
  { name: "Jon Rahm", country: "ESP", rank: 3 },
  { name: "Viktor Hovland", country: "NOR", rank: 4 },
  { name: "Xander Schauffele", country: "USA", rank: 5 },
];

// Major championships for highlighting
const MAJORS = ["Masters", "PGA Championship", "U.S. Open", "The Open Championship", "Open Championship"];

// Course data for major tournaments
const COURSE_INFO: Record<string, { par: number; yards: number; description: string; location: string; established?: number }> = {
  "Kapalua Plantation": { par: 73, yards: 7596, description: "Dramatic elevation changes with sweeping ocean views on Maui's northwestern tip.", location: "Kapalua, Hawaii", established: 1991 },
  "Augusta National": { par: 72, yards: 7545, description: "Iconic azaleas, Amen Corner, and the most prestigious tournament in golf.", location: "Augusta, Georgia", established: 1933 },
  "Pebble Beach": { par: 72, yards: 7075, description: "Stunning coastal links where every hole offers Pacific Ocean views.", location: "Pebble Beach, California", established: 1919 },
  "TPC Scottsdale": { par: 71, yards: 7261, description: "Home to the rowdiest hole in golf - the famous 16th stadium par-3.", location: "Scottsdale, Arizona", established: 1986 },
  "Riviera Country Club": { par: 71, yards: 7322, description: "Classic Golden Age design known as 'Hogan's Alley' for Ben Hogan's dominance.", location: "Pacific Palisades, California", established: 1926 },
  "Bay Hill Club": { par: 72, yards: 7466, description: "Arnold Palmer's home course with challenging water holes and fast greens.", location: "Orlando, Florida", established: 1961 },
  "TPC Sawgrass": { par: 72, yards: 7245, description: "Home of the iconic island green 17th - the most famous par-3 in golf.", location: "Ponte Vedra Beach, Florida", established: 1980 },
  "Valhalla": { par: 72, yards: 7530, description: "Jack Nicklaus design that's hosted multiple major championships.", location: "Louisville, Kentucky", established: 1986 },
  "Pinehurst No. 2": { par: 72, yards: 7588, description: "Donald Ross masterpiece with iconic domed greens and sandy waste areas.", location: "Pinehurst, North Carolina", established: 1907 },
  "Royal Troon": { par: 71, yards: 7385, description: "Scottish links with the famous 'Postage Stamp' 8th hole.", location: "Troon, Scotland", established: 1878 },
};

// Past winners data for storytelling
const TOURNAMENT_HISTORY: Record<string, { winners: { year: number; name: string; score: string }[]; recordScore?: string; recordHolder?: string }> = {
  "The Sentry": { winners: [{ year: 2025, name: "Hideki Matsuyama", score: "-35" }, { year: 2024, name: "Chris Kirk", score: "-29" }, { year: 2023, name: "Jon Rahm", score: "-27" }], recordScore: "-35", recordHolder: "Hideki Matsuyama (2025)" },
  "Masters Tournament": { winners: [{ year: 2025, name: "Scottie Scheffler", score: "-11" }, { year: 2024, name: "Scottie Scheffler", score: "-11" }, { year: 2023, name: "Jon Rahm", score: "-12" }], recordScore: "-18", recordHolder: "Tiger Woods (1997)" },
  "THE PLAYERS Championship": { winners: [{ year: 2025, name: "Scottie Scheffler", score: "-17" }, { year: 2024, name: "Scottie Scheffler", score: "-20" }, { year: 2023, name: "Scottie Scheffler", score: "-17" }], recordScore: "-20", recordHolder: "Scottie Scheffler (2024)" },
  "U.S. Open": { winners: [{ year: 2025, name: "Bryson DeChambeau", score: "-6" }, { year: 2024, name: "Bryson DeChambeau", score: "-6" }, { year: 2023, name: "Wyndham Clark", score: "-10" }] },
  "PGA Championship": { winners: [{ year: 2025, name: "Xander Schauffele", score: "-21" }, { year: 2024, name: "Xander Schauffele", score: "-21" }, { year: 2023, name: "Brooks Koepka", score: "-9" }] },
};

// Notable storylines generator
function getTournamentStorylines(tournamentName: string): string[] {
  const stories: string[] = [];
  const history = Object.entries(TOURNAMENT_HISTORY).find(([key]) => 
    tournamentName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(tournamentName.toLowerCase().replace('the ', ''))
  );
  
  if (history) {
    const [, data] = history;
    if (data.winners[0]) {
      stories.push(`${data.winners[0].name} seeks back-to-back titles after ${data.winners[0].score} finish`);
    }
    if (data.recordScore) {
      stories.push(`Tournament record: ${data.recordScore} by ${data.recordHolder}`);
    }
  }
  
  // Add generic storylines
  stories.push("World No. 1 Scottie Scheffler looking to extend dominance");
  stories.push("Rory McIlroy chasing elusive fifth major");
  
  return stories.slice(0, 3);
}

// Expected field for upcoming tournaments
const EXPECTED_FIELD = [
  { name: "Scottie Scheffler", rank: 1, flag: "🇺🇸" },
  { name: "Xander Schauffele", rank: 2, flag: "🇺🇸" },
  { name: "Rory McIlroy", rank: 3, flag: "🇬🇧" },
  { name: "Jon Rahm", rank: 4, flag: "🇪🇸" },
  { name: "Collin Morikawa", rank: 5, flag: "🇺🇸" },
  { name: "Viktor Hovland", rank: 6, flag: "🇳🇴" },
];

// Comprehensive golfer database with stats
interface GolferProfile {
  id: string;
  name: string;
  country: string;
  flag: string;
  worldRank: number;
  fedexRank: number;
  age: number;
  turnsProYear: number;
  college?: string;
  birthplace: string;
  stats: {
    avgScore: number;
    drivingDistance: number;
    drivingAccuracy: number;
    greensInReg: number;
    puttsPerRound: number;
    scrambling: number;
  };
  earnings2025: number;
  wins: number;
  majors: number;
  recentResults: { tournament: string; position: string; score: string }[];
  photoUrl?: string;
}

const GOLFER_DATABASE: GolferProfile[] = [
  {
    id: "scottie-scheffler", name: "Scottie Scheffler", country: "USA", flag: "🇺🇸",
    worldRank: 1, fedexRank: 1, age: 28, turnsProYear: 2018, college: "Texas", birthplace: "Ridgewood, NJ",
    stats: { avgScore: 68.6, drivingDistance: 306, drivingAccuracy: 62.1, greensInReg: 72.4, puttsPerRound: 28.2, scrambling: 68.5 },
    earnings2025: 28500000, wins: 14, majors: 2,
    recentResults: [
      { tournament: "Masters", position: "1st", score: "-11" },
      { tournament: "THE PLAYERS", position: "1st", score: "-17" },
      { tournament: "Arnold Palmer Invitational", position: "T3", score: "-12" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10404.png&w=350&h=254"
  },
  {
    id: "xander-schauffele", name: "Xander Schauffele", country: "USA", flag: "🇺🇸",
    worldRank: 2, fedexRank: 2, age: 31, turnsProYear: 2015, college: "San Diego State", birthplace: "San Diego, CA",
    stats: { avgScore: 69.1, drivingDistance: 302, drivingAccuracy: 58.7, greensInReg: 70.2, puttsPerRound: 28.5, scrambling: 65.2 },
    earnings2025: 18200000, wins: 10, majors: 2,
    recentResults: [
      { tournament: "PGA Championship", position: "1st", score: "-21" },
      { tournament: "The Open", position: "1st", score: "-9" },
      { tournament: "Travelers Championship", position: "T5", score: "-14" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10140.png&w=350&h=254"
  },
  {
    id: "rory-mcilroy", name: "Rory McIlroy", country: "NIR", flag: "🇬🇧",
    worldRank: 3, fedexRank: 3, age: 36, turnsProYear: 2007, birthplace: "Holywood, Northern Ireland",
    stats: { avgScore: 69.3, drivingDistance: 318, drivingAccuracy: 54.3, greensInReg: 68.9, puttsPerRound: 28.8, scrambling: 62.1 },
    earnings2025: 15800000, wins: 26, majors: 4,
    recentResults: [
      { tournament: "Wells Fargo Championship", position: "1st", score: "-15" },
      { tournament: "U.S. Open", position: "T2", score: "-5" },
      { tournament: "Masters", position: "T4", score: "-8" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/3470.png&w=350&h=254"
  },
  {
    id: "jon-rahm", name: "Jon Rahm", country: "ESP", flag: "🇪🇸",
    worldRank: 4, fedexRank: 8, age: 30, turnsProYear: 2016, college: "Arizona State", birthplace: "Barrika, Spain",
    stats: { avgScore: 69.5, drivingDistance: 312, drivingAccuracy: 56.8, greensInReg: 69.4, puttsPerRound: 28.4, scrambling: 66.7 },
    earnings2025: 12400000, wins: 12, majors: 2,
    recentResults: [
      { tournament: "Masters", position: "T6", score: "-6" },
      { tournament: "LIV Jeddah", position: "1st", score: "-22" },
      { tournament: "The Open", position: "T8", score: "-4" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9780.png&w=350&h=254"
  },
  {
    id: "collin-morikawa", name: "Collin Morikawa", country: "USA", flag: "🇺🇸",
    worldRank: 5, fedexRank: 4, age: 28, turnsProYear: 2019, college: "Cal Berkeley", birthplace: "Los Angeles, CA",
    stats: { avgScore: 69.4, drivingDistance: 295, drivingAccuracy: 64.2, greensInReg: 71.8, puttsPerRound: 28.9, scrambling: 61.4 },
    earnings2025: 11200000, wins: 7, majors: 2,
    recentResults: [
      { tournament: "Zozo Championship", position: "1st", score: "-15" },
      { tournament: "PGA Championship", position: "T3", score: "-17" },
      { tournament: "U.S. Open", position: "T8", score: "-2" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10592.png&w=350&h=254"
  },
  {
    id: "viktor-hovland", name: "Viktor Hovland", country: "NOR", flag: "🇳🇴",
    worldRank: 6, fedexRank: 5, age: 27, turnsProYear: 2019, college: "Oklahoma State", birthplace: "Oslo, Norway",
    stats: { avgScore: 69.6, drivingDistance: 304, drivingAccuracy: 55.9, greensInReg: 68.2, puttsPerRound: 29.1, scrambling: 58.3 },
    earnings2025: 9800000, wins: 8, majors: 0,
    recentResults: [
      { tournament: "BMW Championship", position: "1st", score: "-18" },
      { tournament: "Tour Championship", position: "T2", score: "-16" },
      { tournament: "PGA Championship", position: "T12", score: "-11" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10502.png&w=350&h=254"
  },
  {
    id: "jordan-spieth", name: "Jordan Spieth", country: "USA", flag: "🇺🇸",
    worldRank: 12, fedexRank: 15, age: 31, turnsProYear: 2012, college: "Texas", birthplace: "Dallas, TX",
    stats: { avgScore: 70.1, drivingDistance: 298, drivingAccuracy: 52.4, greensInReg: 65.8, puttsPerRound: 28.3, scrambling: 64.9 },
    earnings2025: 6200000, wins: 14, majors: 3,
    recentResults: [
      { tournament: "Valero Texas Open", position: "1st", score: "-16" },
      { tournament: "Masters", position: "T15", score: "-4" },
      { tournament: "RBC Heritage", position: "T8", score: "-12" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/3095.png&w=350&h=254"
  },
  {
    id: "brooks-koepka", name: "Brooks Koepka", country: "USA", flag: "🇺🇸",
    worldRank: 8, fedexRank: 12, age: 35, turnsProYear: 2012, college: "Florida State", birthplace: "West Palm Beach, FL",
    stats: { avgScore: 69.8, drivingDistance: 315, drivingAccuracy: 53.1, greensInReg: 67.5, puttsPerRound: 28.7, scrambling: 63.8 },
    earnings2025: 8500000, wins: 10, majors: 5,
    recentResults: [
      { tournament: "LIV Las Vegas", position: "1st", score: "-17" },
      { tournament: "PGA Championship", position: "T5", score: "-15" },
      { tournament: "U.S. Open", position: "T6", score: "-3" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/6798.png&w=350&h=254"
  },
  {
    id: "tiger-woods", name: "Tiger Woods", country: "USA", flag: "🇺🇸",
    worldRank: 892, fedexRank: 0, age: 49, turnsProYear: 1996, college: "Stanford", birthplace: "Cypress, CA",
    stats: { avgScore: 72.8, drivingDistance: 285, drivingAccuracy: 48.2, greensInReg: 58.4, puttsPerRound: 29.5, scrambling: 52.1 },
    earnings2025: 450000, wins: 82, majors: 15,
    recentResults: [
      { tournament: "Masters", position: "CUT", score: "+6" },
      { tournament: "The Open", position: "CUT", score: "+8" },
      { tournament: "Genesis Invitational", position: "45th", score: "+3" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/462.png&w=350&h=254"
  },
  {
    id: "bryson-dechambeau", name: "Bryson DeChambeau", country: "USA", flag: "🇺🇸",
    worldRank: 7, fedexRank: 0, age: 31, turnsProYear: 2016, college: "SMU", birthplace: "Modesto, CA",
    stats: { avgScore: 69.2, drivingDistance: 330, drivingAccuracy: 49.8, greensInReg: 68.9, puttsPerRound: 28.6, scrambling: 67.2 },
    earnings2025: 14200000, wins: 11, majors: 2,
    recentResults: [
      { tournament: "U.S. Open", position: "1st", score: "-6" },
      { tournament: "LIV Houston", position: "1st", score: "-20" },
      { tournament: "Masters", position: "T6", score: "-6" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9426.png&w=350&h=254"
  },
  {
    id: "hideki-matsuyama", name: "Hideki Matsuyama", country: "JPN", flag: "🇯🇵",
    worldRank: 9, fedexRank: 6, age: 33, turnsProYear: 2013, birthplace: "Matsuyama, Japan",
    stats: { avgScore: 69.4, drivingDistance: 301, drivingAccuracy: 57.3, greensInReg: 69.8, puttsPerRound: 28.4, scrambling: 65.6 },
    earnings2025: 10500000, wins: 11, majors: 1,
    recentResults: [
      { tournament: "The Sentry", position: "1st", score: "-35" },
      { tournament: "Sony Open", position: "T4", score: "-18" },
      { tournament: "Masters", position: "T8", score: "-5" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/4364.png&w=350&h=254"
  },
  {
    id: "justin-thomas", name: "Justin Thomas", country: "USA", flag: "🇺🇸",
    worldRank: 15, fedexRank: 18, age: 32, turnsProYear: 2013, college: "Alabama", birthplace: "Louisville, KY",
    stats: { avgScore: 69.9, drivingDistance: 308, drivingAccuracy: 54.7, greensInReg: 67.2, puttsPerRound: 28.5, scrambling: 63.1 },
    earnings2025: 5800000, wins: 16, majors: 2,
    recentResults: [
      { tournament: "WGC Match Play", position: "T3", score: "4-2" },
      { tournament: "Masters", position: "T12", score: "-5" },
      { tournament: "PGA Championship", position: "T8", score: "-14" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9396.png&w=350&h=254"
  },
  {
    id: "max-homa", name: "Max Homa", country: "USA", flag: "🇺🇸",
    worldRank: 11, fedexRank: 10, age: 34, turnsProYear: 2013, college: "Cal Berkeley", birthplace: "Burbank, CA",
    stats: { avgScore: 69.7, drivingDistance: 303, drivingAccuracy: 59.4, greensInReg: 68.5, puttsPerRound: 28.6, scrambling: 64.3 },
    earnings2025: 7200000, wins: 7, majors: 0,
    recentResults: [
      { tournament: "Farmers Insurance Open", position: "1st", score: "-14" },
      { tournament: "Genesis Invitational", position: "T2", score: "-11" },
      { tournament: "Arnold Palmer Invitational", position: "T5", score: "-10" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10601.png&w=350&h=254"
  },
  {
    id: "patrick-cantlay", name: "Patrick Cantlay", country: "USA", flag: "🇺🇸",
    worldRank: 10, fedexRank: 9, age: 33, turnsProYear: 2012, college: "UCLA", birthplace: "Long Beach, CA",
    stats: { avgScore: 69.5, drivingDistance: 295, drivingAccuracy: 65.8, greensInReg: 70.1, puttsPerRound: 28.3, scrambling: 66.4 },
    earnings2025: 8100000, wins: 9, majors: 0,
    recentResults: [
      { tournament: "BMW Championship", position: "T2", score: "-16" },
      { tournament: "Tour Championship", position: "3rd", score: "-14" },
      { tournament: "FedEx St. Jude", position: "T4", score: "-15" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10033.png&w=350&h=254"
  },
  {
    id: "dustin-johnson", name: "Dustin Johnson", country: "USA", flag: "🇺🇸",
    worldRank: 45, fedexRank: 0, age: 41, turnsProYear: 2007, birthplace: "Columbia, SC",
    stats: { avgScore: 70.4, drivingDistance: 315, drivingAccuracy: 52.6, greensInReg: 66.2, puttsPerRound: 29.2, scrambling: 59.8 },
    earnings2025: 4200000, wins: 26, majors: 2,
    recentResults: [
      { tournament: "LIV Miami", position: "T8", score: "-12" },
      { tournament: "Masters", position: "T22", score: "-1" },
      { tournament: "LIV Jeddah", position: "T5", score: "-16" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/1466.png&w=350&h=254"
  },
  {
    id: "tommy-fleetwood", name: "Tommy Fleetwood", country: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    worldRank: 14, fedexRank: 11, age: 34, turnsProYear: 2010, birthplace: "Southport, England",
    stats: { avgScore: 69.6, drivingDistance: 298, drivingAccuracy: 61.2, greensInReg: 69.1, puttsPerRound: 28.7, scrambling: 63.5 },
    earnings2025: 6900000, wins: 8, majors: 0,
    recentResults: [
      { tournament: "DP World Tour Championship", position: "1st", score: "-18" },
      { tournament: "The Open", position: "T3", score: "-7" },
      { tournament: "U.S. Open", position: "T4", score: "-4" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/5609.png&w=350&h=254"
  },
  {
    id: "justin-thomas", name: "Justin Thomas", country: "USA", flag: "🇺🇸",
    worldRank: 12, fedexRank: 9, age: 32, turnsProYear: 2013, college: "Alabama", birthplace: "Louisville, KY",
    stats: { avgScore: 69.4, drivingDistance: 305, drivingAccuracy: 59.8, greensInReg: 68.5, puttsPerRound: 28.4, scrambling: 64.2 },
    earnings2025: 9800000, wins: 16, majors: 2,
    recentResults: [
      { tournament: "RBC Heritage", position: "1st", score: "-16" },
      { tournament: "THE PLAYERS", position: "T8", score: "-10" },
      { tournament: "Genesis Invitational", position: "T12", score: "-8" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9396.png&w=350&h=254"
  },
  {
    id: "brooks-koepka", name: "Brooks Koepka", country: "USA", flag: "🇺🇸",
    worldRank: 18, fedexRank: 0, age: 35, turnsProYear: 2012, college: "Florida State", birthplace: "West Palm Beach, FL",
    stats: { avgScore: 70.1, drivingDistance: 312, drivingAccuracy: 55.4, greensInReg: 67.8, puttsPerRound: 29.0, scrambling: 62.1 },
    earnings2025: 5500000, wins: 10, majors: 5,
    recentResults: [
      { tournament: "LIV Singapore", position: "1st", score: "-19" },
      { tournament: "PGA Championship", position: "2nd", score: "-18" },
      { tournament: "LIV Miami", position: "T3", score: "-14" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/6798.png&w=350&h=254"
  },
  {
    id: "jordan-spieth", name: "Jordan Spieth", country: "USA", flag: "🇺🇸",
    worldRank: 25, fedexRank: 22, age: 31, turnsProYear: 2012, college: "Texas", birthplace: "Dallas, TX",
    stats: { avgScore: 70.2, drivingDistance: 295, drivingAccuracy: 57.2, greensInReg: 65.4, puttsPerRound: 27.8, scrambling: 66.8 },
    earnings2025: 4800000, wins: 13, majors: 3,
    recentResults: [
      { tournament: "Valero Texas Open", position: "T5", score: "-12" },
      { tournament: "Masters", position: "T15", score: "-4" },
      { tournament: "RBC Heritage", position: "T9", score: "-13" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/3095.png&w=350&h=254"
  },
  {
    id: "tony-finau", name: "Tony Finau", country: "USA", flag: "🇺🇸",
    worldRank: 16, fedexRank: 14, age: 35, turnsProYear: 2007, birthplace: "Salt Lake City, UT",
    stats: { avgScore: 69.5, drivingDistance: 318, drivingAccuracy: 54.2, greensInReg: 68.9, puttsPerRound: 28.6, scrambling: 63.8 },
    earnings2025: 7200000, wins: 7, majors: 0,
    recentResults: [
      { tournament: "Houston Open", position: "1st", score: "-18" },
      { tournament: "Arnold Palmer Invitational", position: "T6", score: "-10" },
      { tournament: "Genesis Invitational", position: "T4", score: "-11" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9261.png&w=350&h=254"
  },
  {
    id: "hideki-matsuyama", name: "Hideki Matsuyama", country: "JPN", flag: "🇯🇵",
    worldRank: 8, fedexRank: 7, age: 33, turnsProYear: 2013, birthplace: "Matsuyama, Japan",
    stats: { avgScore: 69.2, drivingDistance: 302, drivingAccuracy: 58.1, greensInReg: 71.2, puttsPerRound: 28.9, scrambling: 61.5 },
    earnings2025: 11500000, wins: 10, majors: 1,
    recentResults: [
      { tournament: "The Sentry", position: "1st", score: "-35" },
      { tournament: "Genesis Invitational", position: "T2", score: "-12" },
      { tournament: "Sony Open", position: "1st", score: "-22" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/4364.png&w=350&h=254"
  },
  {
    id: "sahith-theegala", name: "Sahith Theegala", country: "USA", flag: "🇺🇸",
    worldRank: 11, fedexRank: 10, age: 27, turnsProYear: 2020, college: "Pepperdine", birthplace: "Orange, CA",
    stats: { avgScore: 69.3, drivingDistance: 304, drivingAccuracy: 60.5, greensInReg: 68.7, puttsPerRound: 28.3, scrambling: 65.9 },
    earnings2025: 8900000, wins: 3, majors: 0,
    recentResults: [
      { tournament: "WM Phoenix Open", position: "1st", score: "-19" },
      { tournament: "THE PLAYERS", position: "T5", score: "-12" },
      { tournament: "Arnold Palmer Invitational", position: "2nd", score: "-13" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10891.png&w=350&h=254"
  },
  {
    id: "sungjae-im", name: "Sungjae Im", country: "KOR", flag: "🇰🇷",
    worldRank: 15, fedexRank: 13, age: 26, turnsProYear: 2017, birthplace: "Jeju, South Korea",
    stats: { avgScore: 69.4, drivingDistance: 299, drivingAccuracy: 63.8, greensInReg: 69.5, puttsPerRound: 28.5, scrambling: 62.4 },
    earnings2025: 7600000, wins: 4, majors: 0,
    recentResults: [
      { tournament: "Shriners Children's Open", position: "1st", score: "-24" },
      { tournament: "Tour Championship", position: "T6", score: "-11" },
      { tournament: "BMW Championship", position: "T4", score: "-16" },
    ],
    photoUrl: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10159.png&w=350&h=254"
  },
];

export function GolfHubPage() {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState<'leaderboard' | 'schedule' | 'results' | 'players'>('leaderboard');
  const [scheduleData, setScheduleData] = useState<GolfScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<GolfScheduleData['completed'][0] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGolfer, setSelectedGolfer] = useState<GolferProfile | null>(null);

  // Filter golfers based on search
  const filteredGolfers = useMemo(() => {
    if (!searchQuery.trim()) {
      return GOLFER_DATABASE.sort((a, b) => a.worldRank - b.worldRank);
    }
    const query = searchQuery.toLowerCase();
    return GOLFER_DATABASE.filter(g => 
      g.name.toLowerCase().includes(query) ||
      g.country.toLowerCase().includes(query) ||
      g.birthplace.toLowerCase().includes(query)
    ).sort((a, b) => a.worldRank - b.worldRank);
  }, [searchQuery]);

  useEffect(() => {
    fetchSchedule();
  }, []);

  async function fetchSchedule() {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/golf/schedule');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch schedule');
      }
      
      const data = await response.json();
      setScheduleData(data);
      
      // Set current tournament as selected
      if (data.current?.id) {
        setSelectedTournamentId(data.current.id);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const formatPurse = (purse: number, currency = 'USD') => {
    if (!purse) return 'TBD';
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency,
      maximumFractionDigits: 0,
    }).format(purse);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00Z'); // Add noon UTC to avoid timezone issues
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  };

  const formatDateRange = (start: string, end?: string) => {
    if (!start) return '';
    const startDate = new Date(start + 'T12:00:00Z');
    const endDate = end ? new Date(end + 'T12:00:00Z') : new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    const startMonth = startDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const startDay = startDate.getUTCDate();
    const endDay = endDate.getUTCDate();
    const year = startDate.getUTCFullYear();
    
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}, ${year}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  };

  const isMajor = (name: string) => MAJORS.some(m => name.toLowerCase().includes(m.toLowerCase()));

  const currentTournament = scheduleData?.current;
  const upcomingTournaments = scheduleData?.upcoming || [];
  const recentResults = scheduleData?.completed || [];

  const handleResultClick = (result: GolfScheduleData['completed'][0]) => {
    setSelectedResult(result);
  };
  
  const closeTournamentDetail = () => {
    setSelectedResult(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <GolfLoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-4">
        <div className="max-w-4xl mx-auto">
          <BackButton onClick={() => navigate('/sports')} />
          <GolfErrorState error={error} onRetry={fetchSchedule} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Tournament Detail Modal */}
      <AnimatePresence>
        {selectedResult && (
          <TournamentDetailView
            result={selectedResult}
            onClose={closeTournamentDetail}
            formatPurse={formatPurse}
            isMajor={isMajor(selectedResult.name)}
            onViewLeaderboard={(id) => {
              setSelectedTournamentId(id);
              setSelectedTab('leaderboard');
              closeTournamentDetail();
            }}
          />
        )}
      </AnimatePresence>
      
      {/* Golfer Detail Modal */}
      <AnimatePresence>
        {selectedGolfer && (
          <GolferDetailView 
            golfer={selectedGolfer}
            onClose={() => setSelectedGolfer(null)}
          />
        )}
      </AnimatePresence>
      
      {/* Premium Dramatic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/40 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/8 rounded-full blur-[150px]" />
        <div className="absolute top-1/3 right-0 w-[400px] h-[400px] bg-amber-500/6 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-teal-500/5 rounded-full blur-[100px]" />
        {/* Subtle grass texture lines */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(34,197,94,0.3) 3px, rgba(34,197,94,0.3) 4px)`
        }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <BackButton onClick={() => navigate('/sports')} />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-emerald-100 to-white tracking-tight">
                PGA Tour
              </h1>
              <span className="px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                2026 Season
              </span>
            </div>
            <p className="text-white/50 text-sm mt-1">Live leaderboards, betting odds & tournament coverage</p>
          </div>
        </div>


        {/* Hero Tournament Card */}
        {currentTournament ? (
          <LiveTournamentHero 
            tournament={currentTournament}
            formatPurse={formatPurse}
            formatDateRange={formatDateRange}
            isMajor={isMajor(currentTournament.name)}
          />
        ) : upcomingTournaments[0] && (() => {
          // Check if the "upcoming" tournament is actually in the future
          const tournamentDate = new Date(upcomingTournaments[0].startDate + 'T12:00:00Z');
          const today = new Date();
          today.setHours(12, 0, 0, 0);
          return tournamentDate > today;
        })() ? (
          <UpcomingTournamentHero 
            tournament={upcomingTournaments[0]}
            formatPurse={formatPurse}
            formatDateRange={formatDateRange}
            isMajor={isMajor(upcomingTournaments[0].name)}
          />
        ) : recentResults[0] ? (
          // Show most recent completed tournament
          <div 
            className={`relative rounded-3xl overflow-hidden border cursor-pointer hover:scale-[1.01] transition-transform ${
              isMajor(recentResults[0].name)
                ? 'border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-slate-900/30 to-black/50'
                : 'border-cyan-500/20 bg-gradient-to-br from-cyan-950/40 via-black/50 to-transparent'
            }`}
            onClick={() => handleResultClick(recentResults[0])}
          >
            <div className="absolute inset-0">
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[60px]" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-500/10 rounded-full blur-[50px]" />
            </div>
            <div className="relative p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="px-3 py-1 rounded-full bg-cyan-500/30 text-cyan-400 text-xs font-bold flex items-center gap-1.5">
                      <Trophy className="w-3 h-3" />
                      RECENT RESULT
                    </span>
                    {isMajor(recentResults[0].name) && (
                      <span className="px-3 py-1 rounded-full bg-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        MAJOR
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mb-3">
                    {recentResults[0].name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/60">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-cyan-400" />
                      {formatDateRange(recentResults[0].startDate, recentResults[0].endDate)}
                    </span>
                  </div>
                  {recentResults[0].winner && (
                    <div className="flex items-center gap-3 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 w-fit">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Trophy className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-white/50 text-xs uppercase tracking-wider">Champion</p>
                        <p className="text-white font-bold">{recentResults[0].winner}</p>
                      </div>
                      {recentResults[0].winningScore !== undefined && (
                        <span className={`text-lg font-black ${recentResults[0].winningScore < 0 ? 'text-red-400' : 'text-cyan-400'}`}>
                          {recentResults[0].winningScore > 0 ? `+${recentResults[0].winningScore}` : recentResults[0].winningScore === 0 ? 'E' : recentResults[0].winningScore}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-start lg:items-end gap-3">
                  <div className="text-right">
                    <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Purse</p>
                    <p className="text-3xl font-black text-emerald-400">
                      {formatPurse(recentResults[0].purse)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-cyan-400 text-sm font-medium">
                    <span>View Details</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* World Rankings Quick View */}
        <div className="mt-6 mb-8">
          <WorldRankingsStrip golfers={TOP_GOLFERS} />
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
          {[
            { key: 'leaderboard', label: 'Leaderboard', icon: Trophy, color: 'emerald' },
            { key: 'players', label: 'Players', icon: Users, color: 'violet' },
            { key: 'schedule', label: 'Schedule', icon: Calendar, color: 'cyan' },
            { key: 'results', label: 'Results', icon: Award, color: 'amber' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key as any)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all min-h-[48px] active:scale-95 ${
                selectedTab === tab.key
                  ? tab.color === 'emerald' 
                    ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                    : tab.color === 'cyan'
                    ? 'bg-cyan-500/20 text-cyan-400 border-2 border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                    : tab.color === 'violet'
                    ? 'bg-violet-500/20 text-violet-400 border-2 border-violet-500/40 shadow-lg shadow-violet-500/10'
                    : 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/40 shadow-lg shadow-amber-500/10'
                  : 'bg-white/5 text-white/50 border-2 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {selectedTab === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-black/50 to-transparent p-1 mb-6">
                <div className="flex items-center gap-2 px-4 py-3">
                  <Trophy className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg font-bold text-white">
                    {selectedTournamentId === currentTournament?.id || !selectedTournamentId
                      ? currentTournament?.name || upcomingTournaments[0]?.name || 'Tournament Leaderboard'
                      : 'Tournament Results'}
                  </h2>
                  {currentTournament && selectedTournamentId === currentTournament.id && (
                    <span className="ml-auto px-2 py-1 rounded-full bg-emerald-500/30 text-emerald-400 text-xs font-bold animate-pulse">
                      LIVE
                    </span>
                  )}
                </div>
              </div>
              
              {selectedTournamentId || currentTournament?.id || upcomingTournaments[0]?.id ? (
                <GolfLeaderboard 
                  tournamentId={selectedTournamentId || currentTournament?.id || upcomingTournaments[0]?.id}
                  tournamentName={currentTournament?.name || upcomingTournaments[0]?.name || 'Tournament'}
                  courseName={currentTournament?.course || upcomingTournaments[0]?.course || ''}
                  round={currentTournament?.currentRound || 1}
                />
              ) : (
                <EmptyLeaderboard />
              )}
            </motion.div>
          )}

          {selectedTab === 'schedule' && (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <SectionHeader 
                icon={<Calendar className="w-5 h-5 text-cyan-400" />}
                title={`${scheduleData?.season || new Date().getFullYear()} Schedule`}
                subtitle={`${upcomingTournaments.length} upcoming events`}
              />

              {upcomingTournaments.length > 0 ? (
                <div className="grid gap-3">
                  {upcomingTournaments.map((tournament, idx) => (
                    <TournamentCard 
                      key={tournament.id}
                      tournament={tournament}
                      index={idx}
                      formatPurse={formatPurse}
                      formatDateRange={formatDateRange}
                      isMajor={isMajor(tournament.name)}
                      onClick={() => {
                        setSelectedTournamentId(tournament.id);
                        setSelectedTab('leaderboard');
                      }}
                    />
                  ))}
                </div>
              ) : (
                <EmptySchedule />
              )}
            </motion.div>
          )}

          {selectedTab === 'players' && (
            <motion.div
              key="players"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-400" />
                <input
                  type="text"
                  placeholder="Search golfers by name, country, or birthplace..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 rounded-xl bg-white/5 border border-violet-500/30 text-white placeholder-white/40 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 text-base"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Results Count */}
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Users className="w-4 h-4" />
                <span>{filteredGolfers.length} golfer{filteredGolfers.length !== 1 ? 's' : ''} found</span>
              </div>

              {/* Golfer Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredGolfers.map((golfer) => (
                  <GolferCard 
                    key={golfer.id}
                    golfer={golfer}
                    onClick={() => setSelectedGolfer(golfer)}
                  />
                ))}
              </div>

              {filteredGolfers.length === 0 && (
                <div className="text-center py-16">
                  <Users className="w-12 h-12 text-white/20 mx-auto mb-4" />
                  <p className="text-white/50">No golfers found matching "{searchQuery}"</p>
                </div>
              )}
            </motion.div>
          )}

          {selectedTab === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <SectionHeader 
                icon={<Award className="w-5 h-5 text-amber-400" />}
                title="Recent Results"
                subtitle="Tournament winners & final standings"
              />

              {recentResults.length > 0 ? (
                <div className="grid gap-3">
                  {recentResults.slice(0, 10).map((result, idx) => (
                    <ResultCard 
                      key={result.id}
                      result={result}
                      index={idx}
                      formatDate={formatDate}
                      formatPurse={formatPurse}
                      isMajor={isMajor(result.name)}
                      onClick={() => handleResultClick(result)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyResults />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Golf Betting Intelligence Section */}
        <GolfBettingSection 
          tournament={currentTournament || upcomingTournaments[0]}
          formatPurse={formatPurse}
        />

        {/* Coach G Section */}
        <div className="mt-8">
          <SectionHeader 
            icon={<Sparkles className="w-5 h-5 text-violet-400" />}
            title="Ask Coach G"
            subtitle="Golf betting insights & analysis"
          />
          <div className="mt-4">
            <CoachCommandCard sportKey="golf" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Back Button Component
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
    >
      <ArrowLeft className="w-5 h-5 text-white/70" />
    </button>
  );
}

// Loading State
function GolfLoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 animate-pulse" />
        <Flag className="w-10 h-10 text-emerald-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="text-center">
        <p className="text-white font-medium">Loading PGA Tour</p>
        <p className="text-white/40 text-sm">Fetching tournament data...</p>
      </div>
    </div>
  );
}

// Error State
function GolfErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-8 text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
      <h3 className="text-lg font-bold text-white mb-2">Unable to Load Data</h3>
      <p className="text-white/50 text-sm mb-4 max-w-md mx-auto">{error}</p>
      <button 
        onClick={onRetry}
        className="px-6 py-3 bg-red-500/20 text-red-400 rounded-xl font-bold border border-red-500/30 hover:bg-red-500/30 transition-colors min-h-[48px]"
      >
        Try Again
      </button>
    </div>
  );
}

// Live Tournament Hero
function LiveTournamentHero({ tournament, formatPurse, formatDateRange, isMajor }: {
  tournament: Tournament;
  formatPurse: (p: number, c?: string) => string;
  formatDateRange: (s: string, e?: string) => string;
  isMajor: boolean;
}) {
  return (
    <div className={`relative rounded-3xl overflow-hidden border ${
      isMajor 
        ? 'border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-emerald-950/30 to-black/50'
        : 'border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-black/50 to-transparent'
    }`}>
      {/* Decorative Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[60px]" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-500/10 rounded-full blur-[50px]" />
        {/* Golf course pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.3) 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }} />
        </div>
      </div>

      <div className="relative p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Tournament Info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-3 py-1 rounded-full bg-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                LIVE
              </span>
              <span className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-xs font-semibold">
                Round {tournament.currentRound || 1} of 4
              </span>
              {isMajor && (
                <span className="px-3 py-1 rounded-full bg-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  MAJOR
                </span>
              )}
            </div>
            
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mb-3">
              {tournament.name}
            </h2>
            
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/60">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-400" />
                {tournament.course}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-cyan-400" />
                {formatDateRange(tournament.startDate, tournament.endDate)}
              </span>
            </div>
          </div>

          {/* Right: Purse & Action */}
          <div className="flex flex-col items-start lg:items-end gap-3">
            <div className="text-right">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Purse</p>
              <p className={`text-3xl font-black ${isMajor ? 'text-amber-400' : 'text-emerald-400'}`}>
                {formatPurse(tournament.purse, tournament.currency)}
              </p>
            </div>
            {tournament.defendingChamp && (
              <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm">
                <span className="text-white/40">Defending: </span>
                <span className="text-white font-semibold">{tournament.defendingChamp}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Upcoming Tournament Hero - PREMIUM VERSION
function UpcomingTournamentHero({ tournament, formatPurse, formatDateRange, isMajor }: {
  tournament: Tournament;
  formatPurse: (p: number, c?: string) => string;
  formatDateRange: (s: string, e?: string) => string;
  isMajor: boolean;
}) {
  const courseInfo = COURSE_INFO[tournament.course];
  const storylines = getTournamentStorylines(tournament.name);
  const history = Object.entries(TOURNAMENT_HISTORY).find(([key]) => 
    tournament.name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(tournament.name.toLowerCase().replace('the ', ''))
  );
  const pastWinners = history?.[1]?.winners || [];

  // Calculate days until tournament
  const daysUntil = Math.ceil((new Date(tournament.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className={`relative rounded-3xl overflow-hidden border ${
      isMajor 
        ? 'border-amber-500/40 bg-gradient-to-br from-amber-950/50 via-slate-900/80 to-black'
        : 'border-cyan-500/30 bg-gradient-to-br from-slate-900/90 via-emerald-950/30 to-black'
    }`}>
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className={`absolute top-0 right-0 w-72 h-72 rounded-full blur-[100px] ${isMajor ? 'bg-amber-500/15' : 'bg-cyan-500/10'}`} />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-[60px]" />
        {/* Golf pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />
      </div>

      <div className="relative">
        {/* Header Section */}
        <div className="p-6 sm:p-8 pb-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
              isMajor ? 'bg-amber-500/30 text-amber-300' : 'bg-cyan-500/25 text-cyan-300'
            }`}>
              {daysUntil > 0 ? `${daysUntil} Days Away` : 'Starting Soon'}
            </span>
            {isMajor && (
              <span className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/40 to-yellow-500/30 text-amber-200 text-xs font-black flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" />
                MAJOR CHAMPIONSHIP
              </span>
            )}
          </div>
          
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-2 tracking-tight">
            {tournament.name}
          </h2>
          
          <p className="text-lg text-white/60 font-medium">
            {formatDateRange(tournament.startDate, tournament.endDate)}
          </p>
        </div>

        {/* Course Info Card */}
        <div className="px-6 sm:px-8 pb-4">
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Flag className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-white mb-1">{tournament.course}</h3>
                {courseInfo && (
                  <>
                    <p className="text-white/50 text-sm mb-3">{courseInfo.location}</p>
                    <div className="flex flex-wrap gap-3 mb-3">
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-white/80 text-sm font-semibold">
                        Par {courseInfo.par}
                      </span>
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-white/80 text-sm font-semibold">
                        {courseInfo.yards.toLocaleString()} yards
                      </span>
                      {courseInfo.established && (
                        <span className="px-3 py-1 rounded-lg bg-white/5 text-white/60 text-sm">
                          Est. {courseInfo.established}
                        </span>
                      )}
                    </div>
                    <p className="text-white/40 text-sm leading-relaxed">{courseInfo.description}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="px-6 sm:px-8 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
              <DollarSign className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <p className="text-xl sm:text-2xl font-black text-emerald-400">{formatPurse(tournament.purse, tournament.currency)}</p>
              <p className="text-xs text-white/40 uppercase tracking-wider">Total Purse</p>
            </div>
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
              <Trophy className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <p className="text-xl sm:text-2xl font-black text-amber-400">{formatPurse(tournament.purse * 0.18, tournament.currency)}</p>
              <p className="text-xs text-white/40 uppercase tracking-wider">Winner&apos;s Share</p>
            </div>
            <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-4 text-center col-span-2 sm:col-span-1">
              <Star className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
              <p className="text-xl sm:text-2xl font-black text-cyan-400">700</p>
              <p className="text-xs text-white/40 uppercase tracking-wider">FedEx Cup Pts</p>
            </div>
          </div>
        </div>

        {/* Past Winners */}
        {pastWinners.length > 0 && (
          <div className="px-6 sm:px-8 pb-4">
            <h4 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Award className="w-4 h-4" />
              Recent Champions
            </h4>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-6 px-6 sm:mx-0 sm:px-0">
              {pastWinners.map((winner, idx) => (
                <div 
                  key={winner.year}
                  className={`flex-shrink-0 rounded-xl border p-3 min-w-[140px] ${
                    idx === 0 
                      ? 'bg-amber-500/15 border-amber-500/30' 
                      : 'bg-white/[0.03] border-white/10'
                  }`}
                >
                  <p className={`text-xs font-bold mb-1 ${idx === 0 ? 'text-amber-400' : 'text-white/40'}`}>
                    {idx === 0 ? 'Defending' : winner.year}
                  </p>
                  <p className="text-white font-bold text-sm truncate">{winner.name}</p>
                  <p className={`text-xs font-semibold ${
                    winner.score.startsWith('-') ? 'text-red-400' : 'text-white/50'
                  }`}>{winner.score}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expected Field */}
        <div className="px-6 sm:px-8 pb-4">
          <h4 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Featured Players
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-6 px-6 sm:mx-0 sm:px-0">
            {EXPECTED_FIELD.map((player) => (
              <div 
                key={player.name}
                className="flex-shrink-0 flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2"
              >
                <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/70">
                  {player.rank}
                </span>
                <span className="text-lg">{player.flag}</span>
                <span className="text-white font-medium text-sm whitespace-nowrap">{player.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Storylines */}
        {storylines.length > 0 && (
          <div className="px-6 sm:px-8 pb-6">
            <h4 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-400" />
              Storylines to Watch
            </h4>
            <div className="space-y-2">
              {storylines.map((story, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-3 rounded-xl bg-violet-500/5 border border-violet-500/10 p-3"
                >
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-400 flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <p className="text-white/70 text-sm leading-relaxed">{story}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// World Rankings Strip
function WorldRankingsStrip({ golfers }: { golfers: typeof TOP_GOLFERS }) {
  const FLAGS: Record<string, string> = {
    USA: "🇺🇸", NIR: "🇬🇧", ESP: "🇪🇸", NOR: "🇳🇴"
  };

  return (
    <div className="relative">
      {/* Section Label */}
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-bold text-white/50 uppercase tracking-wider">World Rankings</span>
      </div>
      
      <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
        <div className="flex gap-3 min-w-max">
          {golfers.map((golfer, idx) => (
            <div 
              key={golfer.name}
              className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:scale-[1.02] cursor-pointer ${
                idx === 0
                  ? 'bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-transparent border-amber-500/40 shadow-lg shadow-amber-500/10'
                  : idx < 3
                  ? 'bg-white/[0.06] border-white/15 hover:bg-white/10'
                  : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07]'
              }`}
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${
                idx === 0 
                  ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-black shadow-lg shadow-amber-500/30' 
                  : idx === 1 
                  ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-black'
                  : idx === 2
                  ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white'
                  : 'bg-white/10 text-white/70'
              }`}>
                {golfer.rank}
              </span>
              <span className="text-lg">{FLAGS[golfer.country] || '🏳️'}</span>
              <span className={`font-semibold text-sm ${idx === 0 ? 'text-white' : 'text-white/80'}`}>{golfer.name}</span>
              {idx === 0 && (
                <Crown className="w-4 h-4 text-amber-400 ml-1" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Section Header
function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-sm text-white/40">{subtitle}</p>
      </div>
    </div>
  );
}

// Tournament Card
function TournamentCard({ tournament, index, formatPurse, formatDateRange, isMajor, onClick }: {
  tournament: Tournament;
  index: number;
  formatPurse: (p: number, c?: string) => string;
  formatDateRange: (s: string, e?: string) => string;
  isMajor: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-5 transition-all hover:scale-[1.01] active:scale-[0.99] min-h-[80px] ${
        isMajor 
          ? 'border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-black/30 to-transparent hover:border-amber-500/50' 
          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {isMajor && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" />
                Major
              </span>
            )}
            <span className="text-white/40 text-xs">{formatDateRange(tournament.startDate, tournament.endDate)}</span>
          </div>
          <h4 className="font-bold text-white text-lg truncate">{tournament.name}</h4>
          <div className="flex items-center gap-3 mt-1 text-sm text-white/50">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {tournament.course}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`text-lg font-bold ${isMajor ? 'text-amber-400' : 'text-emerald-400'}`}>
            {formatPurse(tournament.purse, tournament.currency)}
          </span>
          <ChevronRight className="w-5 h-5 text-white/30" />
        </div>
      </div>
    </motion.button>
  );
}

// Tournament Detail View (shows when clicking a completed tournament)
function TournamentDetailView({ 
  result, 
  onClose,
  formatPurse,
  isMajor,
  onViewLeaderboard
}: {
  result: { id: string; name: string; startDate: string; endDate: string; course: string; purse: number; winner?: string; winningScore?: number };
  onClose: () => void;
  formatPurse: (p: number, c?: string) => string;
  isMajor: boolean;
  onViewLeaderboard: (id: string) => void;
}) {
  // Get course info
  const courseInfo = Object.entries(COURSE_INFO).find(([key]) => 
    result.course?.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(result.course?.toLowerCase() || '')
  )?.[1];
  
  // Get tournament history
  const history = Object.entries(TOURNAMENT_HISTORY).find(([key]) => 
    result.name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(result.name.toLowerCase().replace('the ', ''))
  )?.[1];
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00Z');
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };
  
  const scoreColor = (score: number | undefined) => {
    if (score === undefined) return 'text-white';
    return score < 0 ? 'text-red-400' : score > 0 ? 'text-sky-400' : 'text-white';
  };
  
  const formatScore = (score: number | string | undefined) => {
    if (score === undefined) return '';
    if (typeof score === 'string') return score;
    return score > 0 ? `+${score}` : score === 0 ? 'E' : score.toString();
  };
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm overflow-auto"
    >
      <div className="min-h-screen p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 mb-6 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all min-h-[44px]"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Results</span>
          </button>
          
          {/* Winner Hero */}
          <div className={`relative rounded-3xl overflow-hidden border mb-6 ${
            isMajor 
              ? 'border-amber-500/30 bg-gradient-to-br from-amber-950/50 via-yellow-950/30 to-black/50'
              : 'border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-black/50 to-transparent'
          }`}>
            {/* Decorative glow */}
            <div className="absolute inset-0">
              <div className={`absolute top-0 right-0 w-96 h-96 rounded-full blur-[100px] ${isMajor ? 'bg-amber-500/20' : 'bg-emerald-500/15'}`} />
              <div className={`absolute bottom-0 left-0 w-64 h-64 rounded-full blur-[80px] ${isMajor ? 'bg-yellow-500/10' : 'bg-cyan-500/10'}`} />
            </div>
            
            <div className="relative p-6 sm:p-10">
              {/* Tournament Badge */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {isMajor && (
                  <span className="px-3 py-1.5 rounded-full bg-amber-500/30 text-amber-400 text-xs font-bold uppercase flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5" />
                    Major Championship
                  </span>
                )}
                <span className="px-3 py-1.5 rounded-full bg-white/10 text-white/60 text-xs font-semibold">
                  Final Results
                </span>
              </div>
              
              {/* Tournament Name */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-2">
                {result.name}
              </h1>
              
              <p className="text-white/50 text-lg mb-8">
                {formatDate(result.endDate || result.startDate)}
              </p>
              
              {/* Winner Spotlight */}
              {result.winner && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center ${
                    isMajor ? 'bg-gradient-to-br from-amber-500 to-yellow-600' : 'bg-gradient-to-br from-emerald-500 to-cyan-600'
                  }`}>
                    <Trophy className="w-12 h-12 sm:w-14 sm:h-14 text-white" />
                  </div>
                  <div>
                    <p className="text-white/50 text-sm font-medium uppercase tracking-wide mb-1">Champion</p>
                    <h2 className="text-3xl sm:text-4xl font-black text-white mb-2">{result.winner}</h2>
                    <div className="flex items-center gap-4">
                      <span className={`text-2xl font-bold ${scoreColor(result.winningScore)}`}>
                        {formatScore(result.winningScore)}
                      </span>
                      <span className="text-emerald-400 font-bold text-xl">
                        {formatPurse(result.purse * 0.18)}
                      </span>
                      <span className="text-white/40 text-sm">winner's share</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Info Grid */}
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {/* Course Info Card */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white">Course Details</h3>
              </div>
              <h4 className="text-lg font-bold text-white mb-1">{result.course}</h4>
              {courseInfo ? (
                <>
                  <p className="text-white/40 text-sm mb-3">{courseInfo.location}</p>
                  <div className="flex gap-4 mb-3">
                    <div>
                      <p className="text-white/40 text-xs uppercase">Par</p>
                      <p className="text-white font-bold text-lg">{courseInfo.par}</p>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs uppercase">Yards</p>
                      <p className="text-white font-bold text-lg">{courseInfo.yards.toLocaleString()}</p>
                    </div>
                    {courseInfo.established && (
                      <div>
                        <p className="text-white/40 text-xs uppercase">Est.</p>
                        <p className="text-white font-bold text-lg">{courseInfo.established}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-white/50 text-sm leading-relaxed">{courseInfo.description}</p>
                </>
              ) : (
                <p className="text-white/40 text-sm">Course information not available</p>
              )}
            </div>
            
            {/* Tournament Info Card */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white">Tournament Info</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-white/50">Total Purse</span>
                  <span className="text-emerald-400 font-bold">{formatPurse(result.purse)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/50">Winner's Share</span>
                  <span className="text-white font-bold">{formatPurse(result.purse * 0.18)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/50">FedEx Cup Points</span>
                  <span className="text-white font-bold">{isMajor ? '750' : '500'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/50">Field Size</span>
                  <span className="text-white font-bold">{isMajor ? '~90' : '~144'}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Past Champions */}
          {history && history.winners.length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 via-black/30 to-transparent p-6 mb-6">
              <div className="flex items-center gap-2 mb-5">
                <Award className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white">Tournament History</h3>
              </div>
              
              {history.recordScore && (
                <div className="mb-5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-400/70 text-xs uppercase font-bold mb-1">Tournament Record</p>
                  <p className="text-white font-bold">
                    <span className="text-amber-400 text-lg">{history.recordScore}</span>
                    <span className="text-white/50 ml-2">by {history.recordHolder}</span>
                  </p>
                </div>
              )}
              
              <div className="space-y-3">
                <p className="text-white/50 text-sm font-medium uppercase tracking-wide">Recent Champions</p>
                {history.winners.map((winner, idx) => (
                  <div 
                    key={winner.year}
                    className={`flex items-center justify-between p-3 rounded-xl ${
                      idx === 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-12 text-center font-bold ${idx === 0 ? 'text-amber-400' : 'text-white/50'}`}>
                        {winner.year}
                      </span>
                      <span className="text-white font-medium">{winner.name}</span>
                      {idx === 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase">
                          Defending
                        </span>
                      )}
                    </div>
                    <span className={`font-bold ${winner.score.startsWith('-') ? 'text-red-400' : 'text-white'}`}>
                      {winner.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* View Full Leaderboard Button */}
          <button
            onClick={() => onViewLeaderboard(result.id)}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 text-white font-bold hover:from-cyan-500/30 hover:to-emerald-500/30 transition-all min-h-[56px] flex items-center justify-center gap-2"
          >
            <Users className="w-5 h-5 text-cyan-400" />
            <span>View Full Leaderboard</span>
            <ChevronRight className="w-5 h-5 text-white/50" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// Result Card
function ResultCard({ result, index, formatDate, formatPurse, isMajor, onClick }: {
  result: { id: string; name: string; startDate: string; endDate: string; course: string; purse: number; winner?: string; winningScore?: number };
  index: number;
  formatDate: (d: string) => string;
  formatPurse: (p: number, c?: string) => string;
  isMajor: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-5 transition-all hover:scale-[1.01] active:scale-[0.99] min-h-[80px] ${
        isMajor 
          ? 'border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-black/30 to-transparent hover:border-amber-500/50' 
          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {isMajor && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" />
                Major
              </span>
            )}
            <span className="text-white/40 text-xs">{formatDate(result.endDate || result.startDate)}</span>
          </div>
          <h4 className="font-bold text-white text-lg truncate">{result.name}</h4>
          {result.winner && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <span className="text-white font-medium">{result.winner}</span>
              {result.winningScore !== undefined && (
                <span className={`font-bold ${result.winningScore < 0 ? 'text-red-400' : result.winningScore > 0 ? 'text-sky-400' : 'text-white'}`}>
                  {result.winningScore > 0 ? `+${result.winningScore}` : result.winningScore === 0 ? 'E' : result.winningScore}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-emerald-400 font-bold">{formatPurse(result.purse)}</span>
          <div className="flex items-center gap-1 text-cyan-400 text-sm font-medium">
            <span>View</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// Golf Betting Section - Premium betting intelligence
const TOURNAMENT_ODDS = [
  { name: "Scottie Scheffler", odds: "+450", implied: "18.2%", trend: "up", photo: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10404.png&w=350&h=254" },
  { name: "Rory McIlroy", odds: "+700", implied: "12.5%", trend: "stable", photo: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/3470.png&w=350&h=254" },
  { name: "Xander Schauffele", odds: "+900", implied: "10.0%", trend: "up", photo: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10140.png&w=350&h=254" },
  { name: "Jon Rahm", odds: "+1000", implied: "9.1%", trend: "down", photo: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9780.png&w=350&h=254" },
  { name: "Collin Morikawa", odds: "+1400", implied: "6.7%", trend: "up", photo: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10592.png&w=350&h=254" },
  { name: "Viktor Hovland", odds: "+1800", implied: "5.3%", trend: "stable", photo: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10502.png&w=350&h=254" },
  { name: "Ludvig Åberg", odds: "+2000", implied: "4.8%", trend: "up", photo: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/11107.png&w=350&h=254" },
  { name: "Bryson DeChambeau", odds: "+2500", implied: "3.8%", trend: "stable", photo: "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9426.png&w=350&h=254" },
];

const MATCHUP_BETS = [
  { player1: "Scheffler", player2: "McIlroy", line1: "-135", line2: "+115", pick: 1, confidence: "HIGH" },
  { player1: "Rahm", player2: "Hovland", line1: "-120", line2: "+100", pick: 2, confidence: "MEDIUM" },
  { player1: "Schauffele", player2: "Morikawa", line1: "-110", line2: "-110", pick: 1, confidence: "LOW" },
];

const COACH_G_PICKS = [
  { type: "outright", player: "Ludvig Åberg", odds: "+2000", reasoning: "Ball-striking metrics elite, gained 6.5 strokes T2G last 8 rounds" },
  { type: "top10", player: "Tommy Fleetwood", odds: "+200", reasoning: "3 top-10s in last 5 events, course fits his fade" },
  { type: "matchup", player: "Hovland > Rahm", odds: "+100", reasoning: "Rahm's putting struggles continue, Hovland rolling it well" },
];

function GolfBettingSection({ tournament, formatPurse: _formatPurse }: { 
  tournament?: Tournament | null; 
  formatPurse: (p: number, c?: string) => string;
}) {
  const [selectedBetType, setSelectedBetType] = useState<'outright' | 'top10' | 'matchups'>('outright');
  
  if (!tournament) return null;

  return (
    <div className="mt-8 space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/40 to-orange-600/30 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <DollarSign className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200">Betting Intelligence</h2>
            <p className="text-white/40 text-sm">{tournament.name} • Odds & Analysis</p>
          </div>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          Live Odds
        </span>
      </div>

      {/* Coach G Hot Picks - Premium Panel */}
      <div className="rounded-2xl border border-violet-500/40 bg-gradient-to-br from-violet-950/50 via-purple-950/30 to-slate-900/50 p-6 shadow-xl shadow-violet-500/10">
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <img 
              src="/assets/coachg/coach-g-avatar.png?v=2"
              alt="Coach G"
              className="w-14 h-14 rounded-2xl border-2 border-violet-400 shadow-lg shadow-violet-500/30 object-cover cursor-pointer transition-transform hover:scale-105"
              onClick={() => window.location.assign('/scout')}
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-black flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          </div>
          <div>
            <h3 className="font-black text-lg text-white flex items-center gap-2">
              Coach G's Hot Picks
              <Zap className="w-5 h-5 text-amber-400 animate-pulse" />
            </h3>
            <p className="text-violet-300/80 text-sm">AI-powered golf betting insights • Updated today</p>
          </div>
        </div>
        <div className="space-y-3">
          {COACH_G_PICKS.map((pick, idx) => (
            <div key={idx} className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition-all">
              <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                pick.type === 'outright' ? 'bg-gradient-to-r from-amber-500/30 to-yellow-500/20 text-amber-300' :
                pick.type === 'top10' ? 'bg-gradient-to-r from-emerald-500/30 to-teal-500/20 text-emerald-300' :
                'bg-gradient-to-r from-cyan-500/30 to-blue-500/20 text-cyan-300'
              }`}>
                {pick.type === 'top10' ? 'TOP 10' : pick.type}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{pick.player}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">{pick.odds}</span>
                </div>
                <p className="text-white/50 text-xs mt-1">{pick.reasoning}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bet Type Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'outright', label: 'Outright Winner' },
          { key: 'top10', label: 'Top 10 Finish' },
          { key: 'matchups', label: 'Head-to-Head' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSelectedBetType(tab.key as any)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all min-h-[44px] ${
              selectedBetType === tab.key
                ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/40'
                : 'bg-white/5 text-white/50 border-2 border-white/10 hover:border-white/20'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Outright Winner Odds */}
      {selectedBetType === 'outright' && (
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 via-black/50 to-transparent overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">Tournament Winner Odds</h3>
              <span className="text-white/40 text-xs">Best available lines</span>
            </div>
          </div>
          <div className="divide-y divide-white/5">
            {TOURNAMENT_ODDS.map((golfer, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors">
                <span className="text-white/30 text-sm font-mono w-6">{idx + 1}</span>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/30 to-green-600/30 overflow-hidden flex items-center justify-center">
                  {golfer.photo ? (
                    <img src={golfer.photo} alt={golfer.name} className="w-full h-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                  ) : (
                    <User className="w-5 h-5 text-emerald-400/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">{golfer.name}</p>
                  <p className="text-white/40 text-xs">Implied: {golfer.implied}</p>
                </div>
                <div className="flex items-center gap-2">
                  {golfer.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
                  {golfer.trend === 'down' && <TrendingUp className="w-4 h-4 text-red-400 rotate-180" />}
                  <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-sm min-w-[70px] text-center">
                    {golfer.odds}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 10 Finish */}
      {selectedBetType === 'top10' && (
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/20 via-black/50 to-transparent p-5">
          <h3 className="font-bold text-white mb-4">Top 10 Finish Odds</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TOURNAMENT_ODDS.slice(0, 8).map((golfer, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/10 text-center hover:border-emerald-500/30 transition-colors cursor-pointer">
                <p className="font-medium text-white text-sm truncate">{golfer.name.split(' ')[1]}</p>
                <p className="text-emerald-400 font-bold mt-1">{idx < 2 ? '-150' : idx < 4 ? '-110' : '+120'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Head-to-Head Matchups */}
      {selectedBetType === 'matchups' && (
        <div className="space-y-3">
          {MATCHUP_BETS.map((matchup, idx) => (
            <div key={idx} className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/20 via-black/50 to-transparent p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/40 text-xs">72-Hole Matchup</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  matchup.confidence === 'HIGH' ? 'bg-emerald-500/20 text-emerald-400' :
                  matchup.confidence === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-white/10 text-white/50'
                }`}>
                  {matchup.confidence} CONFIDENCE
                </span>
              </div>
              <div className="flex items-center justify-between">
                <button className={`flex-1 p-3 rounded-xl border-2 transition-all ${
                  matchup.pick === 1 
                    ? 'border-emerald-500/50 bg-emerald-500/10' 
                    : 'border-white/10 hover:border-white/20'
                }`}>
                  <p className="font-bold text-white">{matchup.player1}</p>
                  <p className={`font-bold mt-1 ${matchup.pick === 1 ? 'text-emerald-400' : 'text-white/60'}`}>{matchup.line1}</p>
                </button>
                <div className="px-3 text-white/30 text-xs font-medium">VS</div>
                <button className={`flex-1 p-3 rounded-xl border-2 transition-all ${
                  matchup.pick === 2 
                    ? 'border-emerald-500/50 bg-emerald-500/10' 
                    : 'border-white/10 hover:border-white/20'
                }`}>
                  <p className="font-bold text-white">{matchup.player2}</p>
                  <p className={`font-bold mt-1 ${matchup.pick === 2 ? 'text-emerald-400' : 'text-white/60'}`}>{matchup.line2}</p>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Empty States
function EmptyLeaderboard() {
  return (
    <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-slate-900/50 to-black p-12 text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
        <Flag className="w-10 h-10 text-emerald-400/40" />
      </div>
      <h3 className="text-xl font-bold text-white mb-3">No Active Tournament</h3>
      <p className="text-white/50 text-sm max-w-sm mx-auto mb-6">
        Check the schedule for upcoming events or view results from recent tournaments.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/30 transition-all">
          View Schedule
        </button>
        <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-sm font-semibold hover:bg-white/10 transition-all">
          Recent Results
        </button>
      </div>
    </div>
  );
}

// Golfer Card Component
function GolferCard({ golfer, onClick }: { golfer: GolferProfile; onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-slate-900/60 to-black p-5 hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/10 active:scale-[0.98] transition-all group"
    >
      <div className="flex items-start gap-4">
        {/* Photo */}
        <div className="relative">
          <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-teal-600/30 overflow-hidden flex items-center justify-center ring-2 ring-emerald-500/20">
            {golfer.photoUrl ? (
              <img 
                src={golfer.photoUrl} 
                alt={golfer.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Users className="w-8 h-8 text-emerald-400/50" />
            )}
          </div>
          {/* World Rank Badge */}
          <div className={`absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-lg ${
            golfer.worldRank <= 5 
              ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-black' 
              : golfer.worldRank <= 10 
              ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-black'
              : 'bg-black border-2 border-emerald-500 text-emerald-400'
          }`}>
            <span className="text-[10px] font-black">#{golfer.worldRank}</span>
          </div>
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{golfer.flag}</span>
            <h3 className="font-bold text-white truncate text-lg">{golfer.name}</h3>
          </div>
          <p className="text-white/40 text-sm mb-3">{golfer.birthplace}</p>
          
          {/* Quick Stats */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-300 text-xs font-semibold">{golfer.wins} wins</span>
            </div>
            {golfer.majors > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <Crown className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-yellow-300 text-xs font-semibold">{golfer.majors} majors</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300 text-xs font-semibold">{golfer.stats.avgScore} avg</span>
            </div>
          </div>
        </div>
        
        {/* Arrow */}
        <ChevronRight className="w-6 h-6 text-white/20 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all mt-3" />
      </div>
    </motion.button>
  );
}

// Golfer Detail View Modal
function GolferDetailView({ golfer, onClose }: { golfer: GolferProfile; onClose: () => void }) {
  const formatMoney = (n: number) => {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n}`;
  };
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] bg-black/90 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-950/50 via-black to-black overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        
        <div className="p-6 sm:p-8">
          {/* Header with Photo */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
            <div className="relative">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-br from-violet-500/30 to-purple-600/30 overflow-hidden flex items-center justify-center shadow-2xl shadow-violet-500/20">
                {golfer.photoUrl ? (
                  <img 
                    src={golfer.photoUrl} 
                    alt={golfer.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Users className="w-16 h-16 text-violet-400/50" />
                )}
              </div>
              {/* Rank Badge */}
              <div className="absolute -bottom-2 -right-2 px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 border-2 border-black">
                <span className="text-sm font-bold text-white">#{golfer.worldRank}</span>
              </div>
            </div>
            
            <div className="text-center sm:text-left flex-1">
              <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
                <span className="text-3xl">{golfer.flag}</span>
                <h1 className="text-2xl sm:text-3xl font-black text-white">{golfer.name}</h1>
              </div>
              <p className="text-white/50 mb-3">{golfer.birthplace} • Age {golfer.age}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
                {golfer.college && (
                  <span className="text-white/40 text-sm">📚 {golfer.college}</span>
                )}
                <span className="text-white/40 text-sm">⛳ Pro since {golfer.turnsProYear}</span>
              </div>
            </div>
          </div>
          
          {/* Career Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
              <Trophy className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <p className="text-2xl font-black text-white">{golfer.wins}</p>
              <p className="text-white/40 text-xs uppercase">Career Wins</p>
            </div>
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
              <Crown className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <p className="text-2xl font-black text-white">{golfer.majors}</p>
              <p className="text-white/40 text-xs uppercase">Majors</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
              <DollarSign className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <p className="text-2xl font-black text-white">{formatMoney(golfer.earnings2025)}</p>
              <p className="text-white/40 text-xs uppercase">2025 Earnings</p>
            </div>
            <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-4 text-center">
              <TrendingUp className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
              <p className="text-2xl font-black text-white">#{golfer.fedexRank || '—'}</p>
              <p className="text-white/40 text-xs uppercase">FedEx Rank</p>
            </div>
          </div>
          
          {/* Stats Section */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-violet-400" />
              <h3 className="font-bold text-white">Season Statistics</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatItem label="Scoring Avg" value={golfer.stats.avgScore.toFixed(1)} highlight />
              <StatItem label="Driving Dist" value={`${golfer.stats.drivingDistance} yds`} />
              <StatItem label="Driving Acc" value={`${golfer.stats.drivingAccuracy}%`} />
              <StatItem label="GIR" value={`${golfer.stats.greensInReg}%`} />
              <StatItem label="Putts/Round" value={golfer.stats.puttsPerRound.toFixed(1)} />
              <StatItem label="Scrambling" value={`${golfer.stats.scrambling}%`} />
            </div>
          </div>
          
          {/* Recent Results */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-white">Recent Results</h3>
            </div>
            <div className="space-y-3">
              {golfer.recentResults.map((result, i) => (
                <div 
                  key={i}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      result.position === '1st' 
                        ? 'bg-amber-500/20 text-amber-400' 
                        : result.position === 'CUT'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-white/10 text-white/60'
                    }`}>
                      {result.position === '1st' ? (
                        <Trophy className="w-4 h-4" />
                      ) : (
                        <span className="text-xs font-bold">{result.position.replace(/[^\d]/g, '') || '—'}</span>
                      )}
                    </div>
                    <span className="text-white font-medium">{result.tournament}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${
                      result.score.startsWith('-') ? 'text-red-400' : 
                      result.score.startsWith('+') ? 'text-sky-400' : 'text-white'
                    }`}>
                      {result.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Stat Item for Golfer Detail
function StatItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
      <p className="text-white/40 text-xs uppercase">{label}</p>
    </div>
  );
}

function EmptySchedule() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <Calendar className="w-14 h-14 text-white/20 mx-auto mb-4" />
      <h3 className="text-lg font-bold text-white mb-2">Schedule Coming Soon</h3>
      <p className="text-white/40 text-sm">No upcoming tournaments scheduled at this time.</p>
    </div>
  );
}

function EmptyResults() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <Award className="w-14 h-14 text-white/20 mx-auto mb-4" />
      <h3 className="text-lg font-bold text-white mb-2">No Results Yet</h3>
      <p className="text-white/40 text-sm">Tournament results will appear here after completion.</p>
    </div>
  );
}

export default GolfHubPage;
