/**
 * PlayerSearch - Searchable player lookup component for hub pages
 * Uses ESPN search API via backend
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, User, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { buildPlayerRoute, logPlayerNavigation } from "@/react-app/lib/navigationRoutes";

interface SearchResult {
  espnId: string;
  displayName: string;
  position?: string;
  teamName?: string;
  teamAbbr?: string;
  sport: string;
  headshotUrl?: string;
}

interface PlayerSearchProps {
  sport?: string; // Filter to specific sport
  placeholder?: string;
  className?: string;
  onSelect?: (player: SearchResult) => void;
}

export function PlayerSearch({ 
  sport, 
  placeholder = "Search players...",
  className = "",
  onSelect
}: PlayerSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [containerRef]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const sportParam = sport ? `&sport=${sport.toUpperCase()}` : "";
        const res = await fetch(`/api/player/search?q=${encodeURIComponent(query)}${sportParam}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch (err) {
        console.error("Player search error:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, sport]);

  const handleSelect = (player: SearchResult) => {
    if (onSelect) {
      onSelect(player);
    } else {
      // Default navigation
      const sportKey = player.sport?.toLowerCase() || sport?.toLowerCase() || "nba";
      logPlayerNavigation(player.displayName, sportKey);
      navigate(buildPlayerRoute(sportKey, player.displayName));
    }
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 
                     text-white placeholder:text-white/40 text-sm
                     focus:outline-none focus:border-cyan-500/50 focus:bg-white/10
                     transition-all min-h-[44px]"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 animate-spin" />
        )}
      </div>

      {/* Results Dropdown */}
      <AnimatePresence>
        {isOpen && (query.length >= 2 || results.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 z-50
                       bg-slate-900/95 backdrop-blur-xl border border-white/10 
                       rounded-xl shadow-2xl shadow-black/50 overflow-hidden max-h-[300px] overflow-y-auto"
          >
            {loading && results.length === 0 ? (
              <div className="p-4 text-center text-white/50 text-sm">
                Searching...
              </div>
            ) : results.length === 0 && query.length >= 2 ? (
              <div className="p-4 text-center text-white/50 text-sm">
                No players found
              </div>
            ) : (
              <div className="py-1">
                {results.map((player) => (
                  <button
                    key={player.espnId}
                    onClick={() => handleSelect(player)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors text-left"
                  >
                    {/* Player Photo */}
                    <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                      {player.headshotUrl ? (
                        <img 
                          src={player.headshotUrl} 
                          alt={player.displayName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-5 h-5 text-white/30" />
                        </div>
                      )}
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium truncate">{player.displayName}</div>
                      <div className="text-xs text-white/50 truncate">
                        {player.position && <span>{player.position} • </span>}
                        {player.teamName || player.teamAbbr}
                        {!sport && player.sport && <span className="ml-2 text-cyan-400">{player.sport}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PlayerSearch;
