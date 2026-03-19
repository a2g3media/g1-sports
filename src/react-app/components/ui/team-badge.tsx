import { cn } from "@/react-app/lib/utils";
import { Lock, Check } from "lucide-react";
import { getTeamColors, type TeamColors } from "@/react-app/data/team-colors";
import { useMemo } from "react";

/**
 * TeamBadge - Core UI atom for team identity
 * 
 * Logo-free design system using typography + shape + color + state
 * Supports authentic team colors for NFL, NBA, MLB, NHL
 */

export type TeamBadgeStatus = "upcoming" | "live" | "final";
export type TeamBadgeEmphasis = "normal" | "selected" | "winning" | "losing";
export type SurvivorState = "alive" | "sweating" | "eliminated";
export type TeamBadgeSize = "xs" | "sm" | "md" | "lg" | "xl";

type ColorMode = "auto" | "full" | "subtle" | "none";

interface TeamBadgeProps {
  /** 2-3 letter team code, uppercase (e.g., DAL, SF, LAL) */
  teamCode?: string;
  /** Full team name for accessibility */
  teamName?: string;
  /** Game status */
  status?: TeamBadgeStatus;
  /** Selection/result emphasis */
  emphasis?: TeamBadgeEmphasis;
  /** Survivor-specific state */
  survivorState?: SurvivorState;
  /** Component size */
  size?: TeamBadgeSize;
  /** Score to display (for live/final games) */
  score?: number | null;
  /** Whether this team is currently winning */
  isWinning?: boolean;
  /** Interactive click handler */
  onClick?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
  /** Team color mode: auto (default), full, subtle, or none */
  colorMode?: ColorMode;
}

// Size configurations
const sizeConfig: Record<TeamBadgeSize, { 
  container: string; 
  text: string; 
  score: string;
  icon: string;
}> = {
  xs: {
    container: "min-w-[40px] h-6 px-2 rounded-md",
    text: "text-[10px] font-bold tracking-wide",
    score: "text-xs font-bold",
    icon: "w-2.5 h-2.5"
  },
  sm: {
    container: "min-w-[48px] h-8 px-2.5 rounded-lg",
    text: "text-xs font-bold tracking-wide",
    score: "text-sm font-bold",
    icon: "w-3 h-3"
  },
  md: {
    container: "min-w-[64px] h-10 px-3 rounded-xl",
    text: "text-sm font-bold tracking-wide",
    score: "text-lg font-bold",
    icon: "w-3.5 h-3.5"
  },
  lg: {
    container: "min-w-[80px] h-12 px-4 rounded-xl",
    text: "text-base font-bold tracking-wide",
    score: "text-xl font-bold",
    icon: "w-4 h-4"
  },
  xl: {
    container: "min-w-[100px] h-14 px-5 rounded-2xl",
    text: "text-lg font-bold tracking-wide",
    score: "text-2xl font-bold",
    icon: "w-5 h-5"
  }
};

// Derive team abbreviation from full team name or short name
function deriveTeamCode(teamName: string): string {
  // Full team name mappings
  const fullNameToCode: Record<string, string> = {
    // NFL - Full names
    "Kansas City Chiefs": "KC", "San Francisco 49ers": "SF", "Philadelphia Eagles": "PHI",
    "Dallas Cowboys": "DAL", "Buffalo Bills": "BUF", "Miami Dolphins": "MIA",
    "Detroit Lions": "DET", "Baltimore Ravens": "BAL", "Cincinnati Bengals": "CIN",
    "Seattle Seahawks": "SEA", "Las Vegas Raiders": "LV", "New York Jets": "NYJ",
    "New York Giants": "NYG", "Green Bay Packers": "GB", "Pittsburgh Steelers": "PIT",
    "Cleveland Browns": "CLE", "Denver Broncos": "DEN", "Los Angeles Rams": "LAR",
    "Los Angeles Chargers": "LAC", "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL",
    "Carolina Panthers": "CAR", "New Orleans Saints": "NO", "Tampa Bay Buccaneers": "TB",
    "New England Patriots": "NE", "Tennessee Titans": "TEN", "Indianapolis Colts": "IND",
    "Houston Texans": "HOU", "Jacksonville Jaguars": "JAX", "Chicago Bears": "CHI",
    "Minnesota Vikings": "MIN", "Washington Commanders": "WAS",
    // NBA - Full names (all 30 teams)
    "Los Angeles Lakers": "LAL", "Golden State Warriors": "GSW", "Boston Celtics": "BOS",
    "Milwaukee Bucks": "MIL", "Phoenix Suns": "PHX", "Denver Nuggets": "DEN",
    "Miami Heat": "MIA", "Brooklyn Nets": "BKN", "Philadelphia 76ers": "PHI",
    "New York Knicks": "NYK", "LA Clippers": "LAC", "Oklahoma City Thunder": "OKC",
    "Dallas Mavericks": "DAL", "Cleveland Cavaliers": "CLE", "Indiana Pacers": "IND",
    "Atlanta Hawks": "ATL", "Toronto Raptors": "TOR", "Sacramento Kings": "SAC",
    "Minnesota Timberwolves": "MIN", "Chicago Bulls": "CHI", "Charlotte Hornets": "CHA",
    "Detroit Pistons": "DET", "Houston Rockets": "HOU", "Memphis Grizzlies": "MEM",
    "New Orleans Pelicans": "NOP", "Orlando Magic": "ORL", "Portland Trail Blazers": "POR",
    "San Antonio Spurs": "SAS", "Utah Jazz": "UTA", "Washington Wizards": "WAS",
    // MLB - Full names (all 30 teams)
    "New York Yankees": "NYY", "Los Angeles Dodgers": "LAD", "Boston Red Sox": "BOS",
    "Chicago Cubs": "CHC", "Atlanta Braves": "ATL", "San Francisco Giants": "SF",
    "St. Louis Cardinals": "STL", "Philadelphia Phillies": "PHI", "Houston Astros": "HOU",
    "Texas Rangers": "TEX", "San Diego Padres": "SD", "Arizona Diamondbacks": "ARI",
    "Seattle Mariners": "SEA", "Toronto Blue Jays": "TOR", "Baltimore Orioles": "BAL",
    "Tampa Bay Rays": "TB", "Chicago White Sox": "CWS", "Cincinnati Reds": "CIN",
    "Cleveland Guardians": "CLE", "Colorado Rockies": "COL", "Detroit Tigers": "DET",
    "Kansas City Royals": "KC", "Los Angeles Angels": "LAA", "Miami Marlins": "MIA",
    "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
    "Oakland Athletics": "OAK", "Pittsburgh Pirates": "PIT", "Washington Nationals": "WSH",
    // NHL - Full names (all 32 teams)
    "Edmonton Oilers": "EDM", "Florida Panthers": "FLA", "Vegas Golden Knights": "VGK",
    "Dallas Stars": "DAL", "Colorado Avalanche": "COL", "Carolina Hurricanes": "CAR",
    "New York Rangers": "NYR", "Boston Bruins": "BOS", "Toronto Maple Leafs": "TOR",
    "Tampa Bay Lightning": "TBL", "Winnipeg Jets": "WPG", "Vancouver Canucks": "VAN",
    "Minnesota Wild": "MIN", "Los Angeles Kings": "LAK", "New Jersey Devils": "NJD",
    "Pittsburgh Penguins": "PIT", "Anaheim Ducks": "ANA", "Utah Hockey Club": "UTA",
    "Buffalo Sabres": "BUF", "Calgary Flames": "CGY", "Chicago Blackhawks": "CHI",
    "Columbus Blue Jackets": "CBJ", "Detroit Red Wings": "DET", "New York Islanders": "NYI",
    "Ottawa Senators": "OTT", "Philadelphia Flyers": "PHI", "San Jose Sharks": "SJS",
    "Seattle Kraken": "SEA", "St. Louis Blues": "STL", "Washington Capitals": "WSH",
    "Montreal Canadiens": "MTL", "Nashville Predators": "NSH",
  };

  if (fullNameToCode[teamName]) {
    return fullNameToCode[teamName];
  }
  
  // Short name / mascot mappings (for when only team name is passed)
  // NOTE: Some mascot names are shared across leagues. When only a mascot name is passed
  // without sport context, the mapping follows this priority: NFL > NBA > MLB > NHL.
  // For accurate resolution, pass the full team name (e.g., "Florida Panthers" not "Panthers").
  const shortNameToCode: Record<string, string> = {
    // NFL mascots (all 32 teams - official NFL abbreviations)
    "Chiefs": "KC", "49ers": "SF", "Eagles": "PHI", "Cowboys": "DAL", "Bills": "BUF",
    "Dolphins": "MIA", "Lions": "DET", "Ravens": "BAL", "Bengals": "CIN", "Seahawks": "SEA",
    "Raiders": "LV", "Jets": "NYJ", "Giants": "NYG", "Packers": "GB", "Steelers": "PIT",
    "Browns": "CLE", "Broncos": "DEN", "Rams": "LAR", "Chargers": "LAC", "Cardinals": "ARI",
    "Falcons": "ATL", "Panthers": "CAR", "Saints": "NO", "Buccaneers": "TB", "Patriots": "NE",
    "Titans": "TEN", "Colts": "IND", "Texans": "HOU", "Jaguars": "JAX", "Bears": "CHI",
    "Vikings": "MIN", "Commanders": "WAS",
    // NBA mascots (all 30 teams - official NBA abbreviations)
    "Lakers": "LAL", "Warriors": "GSW", "Celtics": "BOS", "Bucks": "MIL", "Suns": "PHX",
    "Nuggets": "DEN", "Heat": "MIA", "Nets": "BKN", "76ers": "PHI", "Knicks": "NYK",
    "Clippers": "LAC", "Thunder": "OKC", "Mavericks": "DAL", "Cavaliers": "CLE",
    "Pacers": "IND", "Hawks": "ATL", "Raptors": "TOR", "Kings": "SAC",
    "Timberwolves": "MIN", "Bulls": "CHI", "Hornets": "CHA", "Pistons": "DET",
    "Rockets": "HOU", "Grizzlies": "MEM", "Pelicans": "NOP", "Magic": "ORL",
    "Trail Blazers": "POR", "Spurs": "SAS", "Jazz": "UTA", "Wizards": "WAS",
    // MLB mascots (all 30 teams - official MLB abbreviations)
    "Yankees": "NYY", "Dodgers": "LAD", "Red Sox": "BOS", "Cubs": "CHC", "Braves": "ATL",
    "Phillies": "PHI", "Astros": "HOU", "Rangers": "TEX", "Padres": "SD",
    "Diamondbacks": "ARI", "Mariners": "SEA", "Blue Jays": "TOR", "Orioles": "BAL", "Rays": "TB",
    "White Sox": "CWS", "Reds": "CIN", "Guardians": "CLE", "Rockies": "COL",
    "Tigers": "DET", "Royals": "KC", "Angels": "LAA", "Marlins": "MIA",
    "Brewers": "MIL", "Twins": "MIN", "Mets": "NYM", "Athletics": "OAK",
    "Pirates": "PIT", "Nationals": "WSH",
    // Note: MLB Giants→SF and Cardinals→STL conflict with NFL; full name resolves correctly
    // NHL mascots (all 32 teams - official NHL abbreviations)
    "Oilers": "EDM", "Golden Knights": "VGK", "Stars": "DAL", "Avalanche": "COL",
    "Hurricanes": "CAR", "Bruins": "BOS", "Maple Leafs": "TOR", "Lightning": "TBL",
    "Canucks": "VAN", "Wild": "MIN", "Devils": "NJD", "Penguins": "PIT",
    "Ducks": "ANA", "Sabres": "BUF", "Flames": "CGY", "Blackhawks": "CHI",
    "Blue Jackets": "CBJ", "Red Wings": "DET", "Islanders": "NYI", "Senators": "OTT",
    "Flyers": "PHI", "Sharks": "SJS", "Kraken": "SEA", "Blues": "STL",
    "Capitals": "WSH", "Canadiens": "MTL", "Predators": "NSH",
    // Note: NHL Panthers→FLA, Rangers→NYR, Jets→WPG, Kings→LAK conflict with other leagues;
    // full team names ("Florida Panthers", "New York Rangers", etc.) resolve correctly
    // Soccer / Premier League
    "Manchester City": "MCI", "Arsenal": "ARS", "Liverpool": "LIV", "Manchester United": "MUN",
    "Chelsea": "CHE", "Tottenham": "TOT", "Newcastle": "NEW", "Aston Villa": "AVL",
    "Brighton": "BHA", "West Ham": "WHU", "Fulham": "FUL", "Brentford": "BRE",
    // College - NCAAF
    "Alabama": "BAMA", "Georgia": "UGA", "Ohio State": "OSU", "Michigan": "MICH",
    "Texas": "TEX", "USC": "USC", "Florida State": "FSU", "Oregon": "ORE",
    "LSU": "LSU", "Clemson": "CLEM", "Penn State": "PSU", "Notre Dame": "ND",
    "Oklahoma": "OU", "Tennessee": "TENN", "Ole Miss": "MISS", "Washington": "UW",
    // College - NCAAB
    "Duke": "DUKE", "North Carolina": "UNC", "Kentucky": "UK", "Kansas": "KU",
    "UCLA": "UCLA", "Gonzaga": "ZAGA", "UConn": "UCONN", "Purdue": "PUR",
    "Arizona": "ARIZ", "Baylor": "BAY", "Houston": "HOU", "Marquette": "MARQ",
    "Creighton": "CREI", "Michigan State": "MSU", "Indiana": "IU",
  };

  if (shortNameToCode[teamName]) {
    return shortNameToCode[teamName];
  }

  // Fallback: return first 2-3 chars uppercase (but this should rarely happen now)
  const words = teamName.split(" ");
  const lastWord = words[words.length - 1];
  return lastWord.slice(0, 3).toUpperCase();
}

export function TeamBadge({
  teamCode,
  teamName,
  status = "upcoming",
  emphasis = "normal",
  survivorState,
  size = "md",
  score,
  isWinning,
  onClick,
  disabled,
  className,
  colorMode = "none"
}: TeamBadgeProps) {
  const config = sizeConfig[size] || sizeConfig.md;
  const displayCode = teamCode || (teamName ? deriveTeamCode(teamName) : "???");
  
  // Get team colors
  const teamColors: TeamColors | null = useMemo(() => {
    if (colorMode === "none") return null;
    return teamName ? getTeamColors(teamName) : null;
  }, [teamName, colorMode]);
  
  // Determine effective color mode based on state
  const effectiveColorMode = useMemo(() => {
    if (colorMode !== "auto") return colorMode;
    // Auto logic: full colors for selected/winning, subtle otherwise
    if (emphasis === "selected" || emphasis === "winning") return "full";
    if (survivorState === "eliminated" || emphasis === "losing") return "none";
    return "subtle";
  }, [colorMode, emphasis, survivorState]);
  
  // Generate dynamic styles for team colors
  const teamColorStyles = useMemo(() => {
    if (!teamColors || effectiveColorMode === "none") return {};
    
    if (effectiveColorMode === "full") {
      return {
        background: `linear-gradient(135deg, ${teamColors.primary} 0%, ${teamColors.primary}dd 60%, ${teamColors.secondary} 100%)`,
        borderColor: teamColors.secondary,
        color: teamColors.text || "#ffffff",
      };
    }
    
    // Subtle mode - light tint
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    
    return {
      background: `linear-gradient(135deg, ${hexToRgba(teamColors.primary, 0.15)} 0%, ${hexToRgba(teamColors.primary, 0.08)} 100%)`,
      borderColor: hexToRgba(teamColors.primary, 0.3),
    };
  }, [teamColors, effectiveColorMode]);
  
  // Check if we have team colors applied
  const hasTeamColors = teamColors && effectiveColorMode !== "none";
  
  // Base container styles
  const baseStyles = cn(
    "relative inline-flex items-center justify-center gap-2",
    "transition-all duration-200 ease-out",
    "border-2",
    config.container
  );
  
  // Status-based styles (only when no team colors)
  const statusStyles = cn({
    // Upcoming: neutral background
    "bg-secondary border-transparent": status === "upcoming" && emphasis === "normal" && !hasTeamColors,
    
    // Live: subtle edge highlight with animated glow
    "bg-secondary ring-2 ring-primary/40 animate-live-glow border-transparent": status === "live" && emphasis === "normal" && !hasTeamColors,
    
    // Final: neutral, slightly subdued
    "bg-secondary/80 border-transparent": status === "final" && emphasis === "normal" && !hasTeamColors,
  });
  
  // Emphasis-based styles (selection + results) - adjusted for team colors
  const emphasisStyles = cn({
    // Selected: accent border and fill with pop animation (team colors override bg)
    "shadow-lg animate-selection-pop": emphasis === "selected",
    "border-primary bg-primary/10 shadow-primary/20": emphasis === "selected" && !hasTeamColors,
    
    // Winning: elevated contrast with celebration glow
    "shadow-lg animate-winner-glow ring-2 ring-emerald-300/90 shadow-[0_0_22px_rgba(16,185,129,0.85),0_0_42px_rgba(16,185,129,0.55)] scale-105": emphasis === "winning",
    "bg-[hsl(var(--success)/0.1)] border-[hsl(var(--success)/0.3)]": emphasis === "winning" && !hasTeamColors,
    
    // Losing: muted contrast
    "bg-muted/60 opacity-70 border-transparent": emphasis === "losing",
  });
  
  // Survivor state styles - uses CSS animation classes from index.css
  const survivorStyles = cn({
    // Alive: heartbeat pulse with success undertone
    "bg-[hsl(var(--success)/0.08)] animate-alive-pulse": survivorState === "alive",
    
    // Sweating: anxious amber edge pulse - fate on the line
    "bg-amber-500/10 ring-2 ring-amber-500/50 animate-pulse-edge": survivorState === "sweating",
    
    // Eliminated: faded grayscale with strike effect
    "bg-muted/40 opacity-50 grayscale animate-eliminate-fade": survivorState === "eliminated",
  });
  
  // Interactive styles
  const interactiveStyles = cn({
    "cursor-pointer hover:scale-105 hover:shadow-lg active:scale-[0.98]": onClick && !disabled,
    "cursor-not-allowed opacity-50": disabled,
  });
  
  // Text color based on state (team colors can override via style)
  const textColor = cn({
    "text-foreground": emphasis === "normal" && !survivorState && effectiveColorMode !== "full",
    "text-primary": emphasis === "selected" && effectiveColorMode !== "full",
    "text-[hsl(var(--success))]": (emphasis === "winning" || survivorState === "alive") && effectiveColorMode !== "full",
    "text-muted-foreground": emphasis === "losing" || survivorState === "eliminated",
    "text-amber-600 dark:text-amber-400": survivorState === "sweating" && effectiveColorMode !== "full",
  });

  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        baseStyles,
        statusStyles,
        emphasisStyles,
        survivorStyles,
        interactiveStyles,
        className
      )}
      style={hasTeamColors ? teamColorStyles : undefined}
      title={teamName || displayCode}
      aria-label={teamName || displayCode}
    >
      {/* Team Code */}
      <span className={cn(config.text, textColor, "tabular-nums select-none")}>
        {displayCode}
      </span>
      
      {/* Score (if provided) */}
      {score !== undefined && score !== null && (
        <span className={cn(
          config.score, 
          "tabular-nums",
          effectiveColorMode === "full" ? "" : (isWinning ? "text-[hsl(var(--success))]" : "text-foreground")
        )}
        style={effectiveColorMode === "full" && teamColors?.text ? { color: teamColors.text } : undefined}
        >
          {score}
        </span>
      )}
      
      {/* Status Indicators */}
      {status === "live" && emphasis !== "selected" && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
        </span>
      )}
      
      {/* Selected checkmark */}
      {emphasis === "selected" && (
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-md">
          <Check className={cn(config.icon, "text-primary-foreground")} />
        </div>
      )}
      
      {/* Locked indicator */}
      {disabled && status === "final" && (
        <Lock className={cn(config.icon, "text-muted-foreground ml-1")} />
      )}
    </Component>
  );
}

/**
 * TeamBadgeWithName - Badge + full team name combo
 */
interface TeamBadgeWithNameProps extends TeamBadgeProps {
  showLabel?: boolean;
  labelPosition?: "bottom" | "right";
}

export function TeamBadgeWithName({
  showLabel = true,
  labelPosition = "bottom",
  teamName,
  teamCode,
  survivorState,
  ...props
}: TeamBadgeWithNameProps) {
  const displayCode = teamCode || (teamName ? deriveTeamCode(teamName) : "???");
  
  return (
    <div className={cn(
      "flex items-center gap-2",
      labelPosition === "bottom" && "flex-col"
    )}>
      <TeamBadge 
        teamCode={displayCode} 
        teamName={teamName}
        survivorState={survivorState}
        {...props} 
      />
      {showLabel && teamName && (
        <span className={cn(
          "text-sm font-medium truncate max-w-[120px]",
          survivorState === "eliminated" && "line-through text-muted-foreground"
        )}>
          {teamName}
        </span>
      )}
    </div>
  );
}

/**
 * Utility: Get team code from full name
 */
export function getTeamCode(teamName: string): string {
  return deriveTeamCode(teamName);
}
