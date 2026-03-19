import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { PlayerSearch } from "@/react-app/components/PlayerSearch";

// Sport configuration with visual identity
export interface SportConfig {
  key: string;
  name: string;
  fullName: string;
  icon: string;
  gradient: string;
  glowColor: string;
  accent: string;
  accentRgb: string;
  darkAccent: string;
  conferences?: string[];
}

export const SPORT_CONFIGS: Record<string, SportConfig> = {
  nba: {
    key: "nba",
    name: "NBA",
    fullName: "National Basketball Association",
    icon: "🏀",
    gradient: "from-orange-500 via-orange-600 to-red-600",
    glowColor: "orange",
    accent: "#F97316",
    accentRgb: "249, 115, 22",
    darkAccent: "#C2410C",
    conferences: ["Eastern", "Western"],
  },
  nfl: {
    key: "nfl",
    name: "NFL",
    fullName: "National Football League",
    icon: "🏈",
    gradient: "from-green-500 via-emerald-600 to-teal-600",
    glowColor: "emerald",
    accent: "#10B981",
    accentRgb: "16, 185, 129",
    darkAccent: "#047857",
    conferences: ["AFC", "NFC"],
  },
  mlb: {
    key: "mlb",
    name: "MLB",
    fullName: "Major League Baseball",
    icon: "⚾",
    gradient: "from-red-500 via-red-600 to-rose-600",
    glowColor: "red",
    accent: "#EF4444",
    accentRgb: "239, 68, 68",
    darkAccent: "#B91C1C",
    conferences: ["American", "National"],
  },
  nhl: {
    key: "nhl",
    name: "NHL",
    fullName: "National Hockey League",
    icon: "🏒",
    gradient: "from-blue-500 via-blue-600 to-indigo-600",
    glowColor: "blue",
    accent: "#3B82F6",
    accentRgb: "59, 130, 246",
    darkAccent: "#1D4ED8",
    conferences: ["Eastern", "Western"],
  },
  ncaaf: {
    key: "ncaaf",
    name: "NCAAF",
    fullName: "College Football",
    icon: "🏈",
    gradient: "from-amber-500 via-yellow-600 to-orange-600",
    glowColor: "amber",
    accent: "#F59E0B",
    accentRgb: "245, 158, 11",
    darkAccent: "#B45309",
    conferences: ["Top 25", "All Games"],
  },
  ncaab: {
    key: "ncaab",
    name: "NCAAB",
    fullName: "College Basketball",
    icon: "🏀",
    gradient: "from-purple-500 via-violet-600 to-indigo-600",
    glowColor: "purple",
    accent: "#8B5CF6",
    accentRgb: "139, 92, 246",
    darkAccent: "#6D28D9",
    conferences: ["Top 25", "All Games"],
  },
  golf: {
    key: "golf",
    name: "Golf",
    fullName: "PGA Tour",
    icon: "⛳",
    gradient: "from-green-400 via-emerald-500 to-green-600",
    glowColor: "green",
    accent: "#22C55E",
    accentRgb: "34, 197, 94",
    darkAccent: "#15803D",
  },
  nascar: {
    key: "nascar",
    name: "NASCAR",
    fullName: "NASCAR Cup Series",
    icon: "🏎️",
    gradient: "from-yellow-500 via-amber-500 to-red-500",
    glowColor: "yellow",
    accent: "#EAB308",
    accentRgb: "234, 179, 8",
    darkAccent: "#A16207",
  },
  mma: {
    key: "mma",
    name: "MMA",
    fullName: "UFC & Mixed Martial Arts",
    icon: "🥊",
    gradient: "from-red-600 via-rose-600 to-pink-600",
    glowColor: "red",
    accent: "#DC2626",
    accentRgb: "220, 38, 38",
    darkAccent: "#B91C1C",
  },
  soccer: {
    key: "soccer",
    name: "Soccer",
    fullName: "Premier League & MLS",
    icon: "⚽",
    gradient: "from-green-500 via-emerald-600 to-teal-500",
    glowColor: "emerald",
    accent: "#10B981",
    accentRgb: "16, 185, 129",
    darkAccent: "#047857",
    conferences: ["Premier League", "MLS"],
  },
  tennis: {
    key: "tennis",
    name: "Tennis",
    fullName: "ATP & WTA Tour",
    icon: "🎾",
    gradient: "from-lime-400 via-green-500 to-emerald-500",
    glowColor: "lime",
    accent: "#84CC16",
    accentRgb: "132, 204, 22",
    darkAccent: "#4D7C0F",
    conferences: ["ATP", "WTA"],
  },
  boxing: {
    key: "boxing",
    name: "Boxing",
    fullName: "Professional Boxing",
    icon: "🥊",
    gradient: "from-red-700 via-red-600 to-orange-500",
    glowColor: "red",
    accent: "#B91C1C",
    accentRgb: "185, 28, 28",
    darkAccent: "#7F1D1D",
    conferences: ["Heavyweight", "All Divisions"],
  },
};

interface SportHubLayoutProps {
  sportKey: string;
  children: ReactNode;
  heroSlot?: ReactNode;
}

export function SportHubLayout({ sportKey, children, heroSlot }: SportHubLayoutProps) {
  const config = SPORT_CONFIGS[sportKey.toLowerCase()] || SPORT_CONFIGS.nba;

  return (
    <div 
      className="min-h-screen bg-[#0a0a0a] overflow-x-hidden"
      style={{
        // CSS custom properties for child components
        // @ts-expect-error CSS custom properties
        "--sport-accent": config.accent,
        "--sport-accent-rgb": config.accentRgb,
        "--sport-dark": config.darkAccent,
      }}
    >
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Top radial glow with sport color */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] blur-3xl opacity-20"
          style={{
            background: `radial-gradient(ellipse at center, rgba(${config.accentRgb}, 0.3), transparent 70%)`
          }}
        />
        {/* Subtle grid */}
        <div 
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '80px 80px'
          }}
        />
        {/* Corner accent glow */}
        <div 
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: config.accent }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Navigation bar */}
        <div className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              {/* Left: Back + Sport badge */}
              <div className="flex items-center gap-4">
                <Link 
                  to="/sports"
                  className="flex items-center justify-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors min-w-[44px] min-h-[44px] -ml-2 active:scale-95"
                >
                  <ChevronLeft className="h-5 w-5" />
                  <span className="hidden sm:inline">All Sports</span>
                </Link>
                
                {/* Sport badge */}
                <div className="flex items-center gap-2">
                  <div 
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ 
                      background: `linear-gradient(135deg, rgba(${config.accentRgb}, 0.2), rgba(${config.accentRgb}, 0.05))`,
                      boxShadow: `0 0 20px rgba(${config.accentRgb}, 0.15)`
                    }}
                  >
                    <span className="text-lg">{config.icon}</span>
                  </div>
                  <div>
                    <h1 className="text-lg font-black tracking-tight text-white">
                      {config.name}
                    </h1>
                  </div>
                </div>
              </div>

              {/* Right: Player Search + Quick nav */}
              <div className="flex items-center gap-2 sm:gap-4">
                {/* Player Search - hidden on very small screens */}
                <div className="hidden sm:block">
                  <PlayerSearch 
                    sport={config.name} 
                    placeholder={`Search ${config.name} players...`}
                    className="w-48 lg:w-64"
                  />
                </div>
                
                {/* Quick nav buttons */}
                <div className="flex items-center gap-1">
                  {["Scores", "Standings", "Leaders"].map((item) => (
                  <button
                    key={item}
                    className="px-3 py-2.5 sm:py-1.5 text-xs font-semibold text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all min-h-[44px] sm:min-h-0 active:scale-95"
                    onClick={() => {
                      document.getElementById(item.toLowerCase())?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    {item}
                  </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hero slot */}
        {heroSlot && (
          <div className="relative">
            {heroSlot}
          </div>
        )}

        {/* Main content */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}

// Section wrapper component for consistent spacing and headers
interface HubSectionProps {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function HubSection({ id, title, subtitle, icon, action, children, className = "" }: HubSectionProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      className={`mb-12 ${className}`}
    >
      {/* Section header */}
      <div className="flex items-end justify-between mb-6">
        <div className="flex items-center gap-3">
          {icon && (
            <div 
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--sport-accent)]/20 to-[var(--sport-accent)]/5 border border-[var(--sport-accent)]/20"
            >
              {icon}
            </div>
          )}
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {action && (
          <div>{action}</div>
        )}
      </div>

      {/* Content */}
      {children}
    </motion.section>
  );
}

export default SportHubLayout;
