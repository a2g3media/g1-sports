import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Trophy, 
  Target, 
  Flame,
  ChevronRight,
  Zap
} from "lucide-react";

// Sport configuration with visual identity
const SPORTS = [
  {
    key: "nba",
    name: "NBA",
    fullName: "National Basketball Association",
    icon: "🏀",
    gradient: "from-orange-500 via-orange-600 to-red-600",
    glowColor: "orange",
    accent: "#F97316",
    season: "In Season",
    isLive: true,
  },
  {
    key: "nfl",
    name: "NFL",
    fullName: "National Football League",
    icon: "🏈",
    gradient: "from-green-500 via-emerald-600 to-teal-600",
    glowColor: "emerald",
    accent: "#10B981",
    season: "Off Season",
    isLive: false,
  },
  {
    key: "mlb",
    name: "MLB",
    fullName: "Major League Baseball",
    icon: "⚾",
    gradient: "from-red-500 via-red-600 to-rose-600",
    glowColor: "red",
    accent: "#EF4444",
    season: "In Season",
    isLive: true,
  },
  {
    key: "nhl",
    name: "NHL",
    fullName: "National Hockey League",
    icon: "🏒",
    gradient: "from-blue-500 via-blue-600 to-indigo-600",
    glowColor: "blue",
    accent: "#3B82F6",
    season: "In Season",
    isLive: true,
  },
  {
    key: "ncaaf",
    name: "NCAAF",
    fullName: "College Football",
    icon: "🏈",
    gradient: "from-amber-500 via-yellow-600 to-orange-600",
    glowColor: "amber",
    accent: "#F59E0B",
    season: "Off Season",
    isLive: false,
  },
  {
    key: "ncaab",
    name: "NCAAB",
    fullName: "College Basketball",
    icon: "🏀",
    gradient: "from-purple-500 via-violet-600 to-indigo-600",
    glowColor: "purple",
    accent: "#8B5CF6",
    season: "In Season",
    isLive: true,
  },
  {
    key: "golf",
    name: "Golf",
    fullName: "PGA Tour",
    icon: "⛳",
    gradient: "from-green-400 via-emerald-500 to-green-600",
    glowColor: "green",
    accent: "#22C55E",
    season: "In Season",
    isLive: true,
  },
  {
    key: "nascar",
    name: "NASCAR",
    fullName: "NASCAR Cup Series",
    icon: "🏎️",
    gradient: "from-yellow-500 via-amber-500 to-red-500",
    glowColor: "yellow",
    accent: "#EAB308",
    season: "In Season",
    isLive: false,
  },
  {
    key: "mma",
    name: "MMA",
    fullName: "UFC & Mixed Martial Arts",
    icon: "🥊",
    gradient: "from-red-600 via-rose-600 to-pink-600",
    glowColor: "red",
    accent: "#DC2626",
    season: "In Season",
    isLive: true,
  },
  {
    key: "soccer",
    name: "Soccer",
    fullName: "Premier League & MLS",
    icon: "⚽",
    gradient: "from-green-500 via-emerald-600 to-teal-500",
    glowColor: "emerald",
    accent: "#10B981",
    season: "In Season",
    isLive: true,
  },
  {
    key: "tennis",
    name: "Tennis",
    fullName: "ATP & WTA Tour",
    icon: "🎾",
    gradient: "from-lime-400 via-green-500 to-emerald-500",
    glowColor: "lime",
    accent: "#84CC16",
    season: "In Season",
    isLive: true,
  },
  {
    key: "boxing",
    name: "Boxing",
    fullName: "Professional Boxing",
    icon: "🥊",
    gradient: "from-red-700 via-red-600 to-orange-500",
    glowColor: "red",
    accent: "#B91C1C",
    season: "In Season",
    isLive: false,
  },
];

function SportCard({ sport, index }: { sport: typeof SPORTS[0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <Link
        to={`/sports/${sport.key}`}
        className="group relative block"
      >
        {/* Card container */}
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-sm transition-all duration-500 hover:border-white/10 hover:shadow-2xl">
          {/* Gradient glow on hover */}
          <div 
            className={`absolute inset-0 bg-gradient-to-br ${sport.gradient} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20`}
          />
          
          {/* Live indicator pulse */}
          {sport.isLive && (
            <div className="absolute top-4 right-4 z-10">
              <div className="relative flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span 
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                    style={{ backgroundColor: sport.accent }}
                  />
                  <span 
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{ backgroundColor: sport.accent }}
                  />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  Live
                </span>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="relative p-6 sm:p-8">
            {/* Sport icon with glow */}
            <div className="mb-6 flex items-center justify-between">
              <div className="relative">
                <div 
                  className="absolute inset-0 blur-2xl opacity-40 transition-opacity duration-500 group-hover:opacity-60"
                  style={{ backgroundColor: sport.accent }}
                />
                <span className="relative text-5xl sm:text-6xl drop-shadow-lg">
                  {sport.icon}
                </span>
              </div>
              
              {/* Arrow indicator */}
              <div 
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-all duration-300 group-hover:border-white/20 group-hover:bg-white/10"
              >
                <ChevronRight className="h-5 w-5 text-white/40 transition-all duration-300 group-hover:text-white group-hover:translate-x-0.5" />
              </div>
            </div>

            {/* Sport name */}
            <h3 className="mb-1 text-2xl sm:text-3xl font-black tracking-tight text-white">
              {sport.name}
            </h3>
            <p className="text-sm text-white/40 font-medium">
              {sport.fullName}
            </p>

            {/* Season status */}
            <div className="mt-4 flex items-center gap-2">
              <div 
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  sport.isLive 
                    ? 'bg-white/10 text-white' 
                    : 'bg-white/5 text-white/40'
                }`}
              >
                {sport.isLive ? (
                  <Flame className="h-3 w-3" style={{ color: sport.accent }} />
                ) : (
                  <Target className="h-3 w-3" />
                )}
                {sport.season}
              </div>
            </div>

            {/* Bottom gradient line */}
            <div 
              className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${sport.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
            />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function SportDirectoryPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Radial gradient from top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/5 via-purple-500/5 to-transparent blur-3xl" />
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '64px 64px'
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 sm:mb-14"
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-white/40 mb-4">
            <Link to="/" className="hover:text-white/60 transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/60">Sports</span>
          </div>

          {/* Title section */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">
                  Sport Hub
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white">
                Choose Your
                <span className="block bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Arena
                </span>
              </h1>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {SPORTS.filter(s => s.isLive).length}
                </div>
                <div className="text-xs text-white/40 uppercase tracking-wider font-medium">
                  Active Leagues
                </div>
              </div>
              <div className="h-12 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
              <div className="text-right">
                <div className="flex items-center gap-1.5 text-2xl sm:text-3xl font-black text-emerald-400">
                  <Trophy className="h-6 w-6" />
                  {SPORTS.length}
                </div>
                <div className="text-xs text-white/40 uppercase tracking-wider font-medium">
                  Total Sports
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Sports Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {SPORTS.map((sport, index) => (
            <SportCard key={sport.key} sport={sport} index={index} />
          ))}
        </div>


      </div>
    </div>
  );
}

export default SportDirectoryPage;
