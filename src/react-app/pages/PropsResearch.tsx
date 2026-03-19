/**
 * Props Research Page - Full-screen props view
 * 
 * Route: /lines/:gameId/props
 * Displays all player props for a game with search, filter, and sort.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Search, Filter, SortAsc, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Loader2, Activity, Clock
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

// ============================================
// TYPES
// ============================================

interface PlayerProp {
  id: number;
  player_name: string;
  team: string | null;
  prop_type: string;
  line_value: number;
  open_line_value: number | null;
  movement: number | null;
  last_updated: string | null;
}

interface GameInfo {
  home_team: string;
  away_team: string;
  home_team_code: string;
  away_team_code: string;
  sport: string;
  start_time: string;
}

// ============================================
// CONSTANTS
// ============================================

const PROP_TYPE_LABELS: Record<string, string> = {
  PASSING_YARDS: 'Passing Yards',
  PASSING_TDS: 'Passing TDs',
  RUSHING_YARDS: 'Rushing Yards',
  RECEIVING_YARDS: 'Receiving Yards',
  RECEPTIONS: 'Receptions',
  POINTS: 'Points',
  REBOUNDS: 'Rebounds',
  ASSISTS: 'Assists',
  STEALS: 'Steals',
  BLOCKS: 'Blocks',
  THREES: '3-Pointers Made',
  HITS: 'Hits',
  RUNS: 'Runs',
  RBIS: 'RBIs',
  STRIKEOUTS: 'Strikeouts',
  HOME_RUNS: 'Home Runs',
  GOALS: 'Goals',
  SHOTS: 'Shots on Goal',
  SAVES: 'Saves',
};

const SORT_OPTIONS = [
  { key: 'movement', label: 'Movement' },
  { key: 'name', label: 'Player A-Z' },
  { key: 'line', label: 'Line Value' },
];

// ============================================
// COMPONENTS
// ============================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,25%,6%)] via-[hsl(220,20%,8%)] to-[hsl(220,25%,4%)]" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/[0.03] rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-500/[0.02] rounded-full blur-[80px]" />
    </div>
  );
}

function GlassCard({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string; 
}) {
  return (
    <div className={cn(
      "bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl",
      className
    )}>
      {children}
    </div>
  );
}

function FilterPill({ 
  label, 
  active, 
  onClick 
}: { 
  label: string; 
  active: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
        "whitespace-nowrap shrink-0",
        active 
          ? "bg-primary text-white" 
          : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80"
      )}
    >
      {label}
    </button>
  );
}

function PropRow({ prop }: { prop: PlayerProp }) {
  const hasMovement = prop.movement !== null && prop.movement !== 0;
  
  return (
    <div className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white truncate">{prop.player_name}</span>
          {prop.team && (
            <span className="text-xs text-white/40 px-1.5 py-0.5 bg-white/[0.04] rounded">
              {prop.team}
            </span>
          )}
        </div>
        <span className="text-xs text-white/50 mt-0.5 block">
          {PROP_TYPE_LABELS[prop.prop_type] || prop.prop_type}
        </span>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Open Line */}
        {prop.open_line_value !== null && (
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-white/30 block">Open</span>
            <span className="text-xs text-white/50">{prop.open_line_value}</span>
          </div>
        )}
        
        {/* Current Line */}
        <div className="text-right">
          <span className="text-[10px] text-white/30 block">Line</span>
          <span className="text-base font-bold text-white">{prop.line_value}</span>
        </div>
        
        {/* Movement */}
        <div className="w-16 text-right">
          {hasMovement ? (
            <div className={cn(
              "flex items-center justify-end gap-1",
              prop.movement! > 0 ? "text-emerald-400" : "text-red-400"
            )}>
              {prop.movement! > 0 
                ? <TrendingUp className="w-3.5 h-3.5" />
                : <TrendingDown className="w-3.5 h-3.5" />
              }
              <span className="text-sm font-semibold">
                {prop.movement! > 0 ? '+' : ''}{prop.movement}
              </span>
            </div>
          ) : (
            <span className="text-xs text-white/20">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CategorySection({ 
  category, 
  props, 
  defaultExpanded = true 
}: { 
  category: string; 
  props: PlayerProp[]; 
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  if (props.length === 0) return null;
  
  return (
    <GlassCard className="overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded 
            ? <ChevronDown className="w-4 h-4 text-white/40" />
            : <ChevronRight className="w-4 h-4 text-white/40" />
          }
          <span className="text-sm font-semibold text-white">
            {PROP_TYPE_LABELS[category] || category}
          </span>
          <span className="text-xs text-white/40 bg-white/[0.04] px-2 py-0.5 rounded-full">
            {props.length}
          </span>
        </div>
      </button>
      
      {expanded && (
        <div className="border-t border-white/[0.04]">
          {props.map((prop) => (
            <PropRow key={prop.id} prop={prop} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function PropsResearch() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  
  const [props, setProps] = useState<PlayerProp[]>([]);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('movement');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch data
  useEffect(() => {
    if (!gameId) return;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch props
        const propsRes = await fetch(`/api/sports-data/props/${gameId}`, {
          credentials: 'include',
        });
        
        if (!propsRes.ok) throw new Error('Failed to fetch props');
        
        const propsData = await propsRes.json();
        setProps(propsData.props || []);
        
        // Try to fetch game info
        try {
          const gameRes = await fetch(`/api/games/${gameId}`, {
            credentials: 'include',
          });
          if (gameRes.ok) {
            const gameData = await gameRes.json();
            setGameInfo(gameData);
          }
        } catch {
          // Game info is optional
        }
        
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Failed to fetch props:', err);
        setError('Unable to load props. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [gameId]);

  // Get unique categories and teams
  const categories = useMemo(() => {
    const cats = new Set<string>();
    props.forEach(p => cats.add(p.prop_type));
    return Array.from(cats);
  }, [props]);

  const teams = useMemo(() => {
    const t = new Set<string>();
    props.forEach(p => {
      if (p.team) t.add(p.team);
    });
    return Array.from(t).sort();
  }, [props]);

  // Filter and sort props
  const filteredProps = useMemo(() => {
    let result = [...props];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.player_name.toLowerCase().includes(query)
      );
    }
    
    // Category filter
    if (selectedCategory) {
      result = result.filter(p => p.prop_type === selectedCategory);
    }
    
    // Team filter
    if (selectedTeam) {
      result = result.filter(p => p.team === selectedTeam);
    }
    
    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'movement':
          return Math.abs(b.movement || 0) - Math.abs(a.movement || 0);
        case 'name':
          return a.player_name.localeCompare(b.player_name);
        case 'line':
          return b.line_value - a.line_value;
        default:
          return 0;
      }
    });
    
    return result;
  }, [props, searchQuery, selectedCategory, selectedTeam, sortBy]);

  // Group by category for display
  const groupedProps = useMemo(() => {
    if (selectedCategory) {
      // If category is selected, show flat list
      return null;
    }
    
    const groups: Record<string, PlayerProp[]> = {};
    filteredProps.forEach(prop => {
      if (!groups[prop.prop_type]) groups[prop.prop_type] = [];
      groups[prop.prop_type].push(prop);
    });
    return groups;
  }, [filteredProps, selectedCategory]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory(null);
    setSelectedTeam(null);
    setSortBy('movement');
  }, []);

  const hasActiveFilters = searchQuery || selectedCategory || selectedTeam;

  return (
    <div className="relative min-h-screen">
      <CinematicBackground />
      
      <div className="relative z-10 max-w-3xl mx-auto px-4 py-6 space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white/70" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Player Props</h1>
            {gameInfo ? (
              <p className="text-xs text-white/50 mt-0.5">
                {gameInfo.away_team_code} @ {gameInfo.home_team_code}
              </p>
            ) : gameId && (
              <p className="text-xs text-white/50 mt-0.5">Game: {gameId}</p>
            )}
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-1 text-[10px] text-white/30">
              <Clock className="w-3 h-3" />
              <span>{lastUpdated.toLocaleTimeString()}</span>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="text-[10px] text-white/30 px-1">
          Informational only. No wagering or sportsbook links in GZ Sports.
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search player name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-10 pr-4 py-2.5 rounded-xl",
              "bg-white/[0.04] border border-white/[0.06]",
              "text-sm text-white placeholder:text-white/30",
              "focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20",
              "transition-all duration-200"
            )}
          />
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              showFilters || hasActiveFilters
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-white/[0.04] text-white/60 hover:text-white/80"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
          
          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <SortAsc className="w-3.5 h-3.5 text-white/40" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={cn(
                "bg-white/[0.04] border border-white/[0.06] rounded-lg",
                "px-3 py-1.5 text-xs text-white",
                "focus:outline-none focus:border-primary/50"
              )}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key} className="bg-gray-900">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Pills */}
        {showFilters && (
          <GlassCard className="p-4 space-y-4">
            {/* Category Filter */}
            <div>
              <span className="text-[10px] text-white/40 uppercase tracking-wide block mb-2">Category</span>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  label="All"
                  active={selectedCategory === null}
                  onClick={() => setSelectedCategory(null)}
                />
                {categories.map((cat) => (
                  <FilterPill
                    key={cat}
                    label={PROP_TYPE_LABELS[cat] || cat}
                    active={selectedCategory === cat}
                    onClick={() => setSelectedCategory(cat)}
                  />
                ))}
              </div>
            </div>
            
            {/* Team Filter */}
            {teams.length > 0 && (
              <div>
                <span className="text-[10px] text-white/40 uppercase tracking-wide block mb-2">Team</span>
                <div className="flex flex-wrap gap-2">
                  <FilterPill
                    label="All"
                    active={selectedTeam === null}
                    onClick={() => setSelectedTeam(null)}
                  />
                  {teams.map((team) => (
                    <FilterPill
                      key={team}
                      label={team}
                      active={selectedTeam === team}
                      onClick={() => setSelectedTeam(team)}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-primary hover:underline"
              >
                Clear all filters
              </button>
            )}
          </GlassCard>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <GlassCard className="p-6 text-center">
            <Activity className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-white/70 mb-3">{error}</p>
            <button
              onClick={() => navigate(-1)}
              className="text-xs text-primary hover:underline"
            >
              Go back
            </button>
          </GlassCard>
        )}

        {/* Empty State */}
        {!loading && !error && filteredProps.length === 0 && (
          <GlassCard className="p-8 text-center">
            <Activity className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/50 mb-1">No props found</p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-primary hover:underline mt-2"
              >
                Clear filters
              </button>
            )}
          </GlassCard>
        )}

        {/* Props List */}
        {!loading && !error && filteredProps.length > 0 && (
          <div className="space-y-4">
            {/* Results Count */}
            <div className="text-xs text-white/40 px-1">
              {filteredProps.length} prop{filteredProps.length !== 1 ? 's' : ''}
              {hasActiveFilters && ' (filtered)'}
            </div>
            
            {/* Grouped by Category */}
            {groupedProps ? (
              Object.entries(groupedProps).map(([category, catProps]) => (
                <CategorySection
                  key={category}
                  category={category}
                  props={catProps}
                  defaultExpanded={catProps.length <= 10}
                />
              ))
            ) : (
              /* Flat List (when category is selected) */
              <GlassCard className="overflow-hidden">
                {filteredProps.map((prop) => (
                  <PropRow key={prop.id} prop={prop} />
                ))}
              </GlassCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PropsResearch;
