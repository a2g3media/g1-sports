/**
 * SoccerSearchDrawer - Unified Search for Soccer System
 * 
 * Premium search drawer with categorized results:
 * - Teams (crest + name + league)
 * - Players (headshot + name + team + position)
 * - Matches (home vs away + date + competition + status)
 * 
 * Mobile-first design with smooth iOS-style sheet animation
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Search, X, ChevronRight } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface SearchTeam {
  id: string;
  name: string;
  leagueName: string;
  leagueId: string;
  logoUrl?: string;
}

interface SearchPlayer {
  id: string;
  name: string;
  teamName: string;
  teamId: string;
  position?: string;
  imageUrl?: string;
}

interface SearchMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  competitionName: string;
  competitionId: string;
  startTime: string;
  status: string;
}

interface SearchResults {
  teams: SearchTeam[];
  players: SearchPlayer[];
  matches: SearchMatch[];
}

// ============================================================================
// COMPONENT
// ============================================================================

interface SoccerSearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SoccerSearchDrawer({ isOpen, onClose }: SoccerSearchDrawerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ teams: [], players: [], matches: [] });
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Auto-focus input when drawer opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure drawer animation has started
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults({ teams: [], players: [], matches: [] });
      return;
    }

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/soccer/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
        }
      } catch (err) {
        console.error('[Search] Error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 250); // 250ms debounce

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [query]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleLinkClick = () => {
    onClose();
    setQuery("");
    setResults({ teams: [], players: [], matches: [] });
  };

  const hasResults = results.teams.length > 0 || results.players.length > 0 || results.matches.length > 0;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Drawer */}
      <div
        className="relative w-full max-w-2xl bg-[#0f0f0f] border border-white/10 
                   sm:rounded-2xl rounded-t-3xl overflow-hidden
                   max-h-[85vh] sm:max-h-[80vh] flex flex-col
                   animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <Search className="w-5 h-5 text-white/40 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams, players, matches…"
            className="flex-1 bg-transparent text-white placeholder:text-white/40 
                     text-base focus:outline-none"
          />
          {isLoading && (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg 
                     bg-white/5 hover:bg-white/10 active:bg-white/15
                     transition-colors touch-manipulation"
            aria-label="Close search"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!query.trim() && (
            <div className="flex items-center justify-center py-16 text-white/40 text-sm">
              Start typing to search across teams, players, and matches
            </div>
          )}

          {query.trim() && !hasResults && !isLoading && (
            <div className="flex items-center justify-center py-16 text-white/40 text-sm">
              No results found
            </div>
          )}

          {/* Teams Section */}
          {results.teams.length > 0 && (
            <div className="border-b border-white/5">
              <div className="px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">
                Teams
              </div>
              <div className="space-y-0.5 pb-2">
                {results.teams.slice(0, 5).map((team) => (
                  <Link
                    key={team.id}
                    to={`/sports/soccer/team/${team.id}`}
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 
                             active:bg-white/10 transition-colors touch-manipulation"
                  >
                    {team.logoUrl ? (
                      <img
                        src={team.logoUrl}
                        alt={team.name}
                        className="w-8 h-8 object-contain flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{team.name}</div>
                      <div className="text-sm text-white/50 truncate">{team.leagueName}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Players Section */}
          {results.players.length > 0 && (
            <div className="border-b border-white/5">
              <div className="px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">
                Players
              </div>
              <div className="space-y-0.5 pb-2">
                {results.players.slice(0, 5).map((player) => (
                  <Link
                    key={player.id}
                    to={`/sports/soccer/player/${player.id}`}
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 
                             active:bg-white/10 transition-colors touch-manipulation"
                  >
                    {player.imageUrl ? (
                      <img
                        src={player.imageUrl}
                        alt={player.name}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{player.name}</div>
                      <div className="text-sm text-white/50 truncate">
                        {player.teamName}
                        {player.position && ` • ${player.position}`}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Matches Section */}
          {results.matches.length > 0 && (
            <div>
              <div className="px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">
                Matches
              </div>
              <div className="space-y-0.5 pb-2">
                {results.matches.slice(0, 5).map((match) => (
                  <Link
                    key={match.id}
                    to={`/sports/soccer/match/${match.id}`}
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 
                             active:bg-white/10 transition-colors touch-manipulation"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">
                        {match.homeTeam} vs {match.awayTeam}
                      </div>
                      <div className="text-sm text-white/50 truncate">
                        {match.competitionName} • {new Date(match.startTime).toLocaleDateString()}
                        {match.status && ` • ${match.status}`}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
