/**
 * LeagueSwitcher - Horizontal league selector with real logos
 * Clean scrollable design for global leagues
 */

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Real league logos - using official sources where available
const LEAGUE_LOGOS: Record<string, { name: string; logo: string; shortName: string }> = {
  "premier-league": {
    name: "Premier League",
    shortName: "EPL",
    logo: "https://upload.wikimedia.org/wikipedia/en/f/f2/Premier_League_Logo.svg",
  },
  "la-liga": {
    name: "La Liga",
    shortName: "La Liga",
    logo: "https://upload.wikimedia.org/wikipedia/commons/1/13/LaLiga.svg",
  },
  "champions-league": {
    name: "UEFA Champions League",
    shortName: "UCL",
    logo: "https://upload.wikimedia.org/wikipedia/en/b/bf/UEFA_Champions_League_logo_2.svg",
  },
  "serie-a": {
    name: "Serie A",
    shortName: "Serie A",
    logo: "https://upload.wikimedia.org/wikipedia/en/e/e1/Serie_A_logo_%282019%29.svg",
  },
  "bundesliga": {
    name: "Bundesliga",
    shortName: "Bundesliga",
    logo: "https://upload.wikimedia.org/wikipedia/en/d/df/Bundesliga_logo_%282017%29.svg",
  },
  "ligue-1": {
    name: "Ligue 1",
    shortName: "Ligue 1",
    logo: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Ligue1.svg",
  },
  "mls": {
    name: "MLS",
    shortName: "MLS",
    logo: "https://upload.wikimedia.org/wikipedia/commons/7/76/MLS_crest_logo_RGB_gradient.svg",
  },
  "europa-league": {
    name: "UEFA Europa League",
    shortName: "UEL",
    logo: "https://upload.wikimedia.org/wikipedia/en/0/03/Europa_League.svg",
  },
};

const LEAGUE_ORDER = [
  "premier-league",
  "la-liga", 
  "champions-league",
  "serie-a",
  "bundesliga",
  "ligue-1",
  "mls",
  "europa-league",
];

interface LeagueSwitcherProps {
  selectedLeague: string;
  onSelectLeague: (league: string) => void;
}

export function LeagueSwitcher({ selectedLeague, onSelectLeague }: LeagueSwitcherProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="relative bg-[#0a0a0a]/80 backdrop-blur-sm border-y border-zinc-800/50">
      {/* Scroll Buttons */}
      <button
        onClick={() => scroll("left")}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-gradient-to-r from-[#0a0a0a] to-transparent hover:from-zinc-900 transition-colors"
      >
        <ChevronLeft className="h-5 w-5 text-zinc-400" />
      </button>
      
      <button
        onClick={() => scroll("right")}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-gradient-to-l from-[#0a0a0a] to-transparent hover:from-zinc-900 transition-colors"
      >
        <ChevronRight className="h-5 w-5 text-zinc-400" />
      </button>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-10 py-3"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {/* All Leagues Option */}
        <button
          onClick={() => onSelectLeague("all")}
          className={`
            flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
            ${selectedLeague === "all" 
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" 
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"
            }
          `}
        >
          All Leagues
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-zinc-700/50 mx-2 flex-shrink-0" />

        {/* League Buttons */}
        {LEAGUE_ORDER.map((leagueKey) => {
          const league = LEAGUE_LOGOS[leagueKey];
          if (!league) return null;
          
          const isSelected = selectedLeague === leagueKey;
          
          return (
            <button
              key={leagueKey}
              onClick={() => onSelectLeague(leagueKey)}
              className={`
                flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200
                ${isSelected 
                  ? "bg-emerald-500/15 border border-emerald-500/30" 
                  : "hover:bg-zinc-800/50 border border-transparent"
                }
              `}
            >
              {/* League Logo */}
              <div className="w-6 h-6 flex items-center justify-center">
                <img 
                  src={league.logo} 
                  alt={league.name}
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    // Fallback to text if logo fails
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              
              {/* League Name */}
              <span className={`text-sm font-medium ${isSelected ? "text-emerald-400" : "text-zinc-300"}`}>
                {league.shortName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default LeagueSwitcher;
