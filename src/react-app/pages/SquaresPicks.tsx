import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { 
  ArrowLeft, Check, Trophy, Grid3X3, 
  DollarSign, Users, Clock, Sparkles, Loader2,
  Lock, Shuffle, RefreshCw, AlertCircle
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { formatCurrency } from "@/shared/escrow";
import {
  StatusPill,
  SportBadge,
} from "@/react-app/components/ui/premium";


interface LeagueInfo {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
  entry_fee_cents: number;
  member_count: number;
}

interface SquaresGrid {
  id: number;
  league_id: number;
  home_team: string;
  away_team: string;
  row_numbers: number[] | null;
  col_numbers: number[] | null;
  price_per_square_cents: number;
  is_numbers_revealed: boolean;
  game_date: string | null;
  game_time: string | null;
  venue: string | null;
  status: string;
}

interface Square {
  id: number;
  grid_id: number;
  row_num: number;
  col_num: number;
  owner_id: string | null;
  owner_name: string | null;
  is_current_user: boolean;
  is_q1_winner: boolean;
  is_q2_winner: boolean;
  is_q3_winner: boolean;
  is_q4_winner: boolean;
  is_final_winner: boolean;
}

interface QuarterScore {
  id: number;
  quarter: string;
  home_score: number | null;
  away_score: number | null;
  winning_square_id: number | null;
  payout_cents: number;
}

// Team colors for visual appeal
const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  "Chiefs": { primary: "#E31837", secondary: "#FFB612" },
  "Eagles": { primary: "#004C54", secondary: "#A5ACAF" },
  "49ers": { primary: "#AA0000", secondary: "#B3995D" },
  "Lions": { primary: "#0076B6", secondary: "#B0B7BC" },
  "Ravens": { primary: "#241773", secondary: "#9E7C0C" },
  "Bills": { primary: "#00338D", secondary: "#C60C30" },
  "Cowboys": { primary: "#003594", secondary: "#869397" },
  "Packers": { primary: "#203731", secondary: "#FFB612" },
  "Patriots": { primary: "#002244", secondary: "#C60C30" },
  "Steelers": { primary: "#FFB612", secondary: "#101820" },
};

function getTeamColor(team: string): string {
  // Check exact match first
  if (TEAM_COLORS[team]) return TEAM_COLORS[team].primary;
  // Check if team name contains a known team
  for (const [key, value] of Object.entries(TEAM_COLORS)) {
    if (team.toLowerCase().includes(key.toLowerCase())) return value.primary;
  }
  return "#666666";
}

export function SquaresPicks() {
  const { id } = useParams<{ id: string }>();
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [grid, setGrid] = useState<SquaresGrid | null>(null);
  const [squares, setSquares] = useState<Square[]>([]);
  const [scores, setScores] = useState<QuarterScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<{row: number; col: number} | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);



  const fetchData = useCallback(async () => {
    if (!id) return;
    
    try {
      // Fetch league info
      const leagueRes = await fetch(`/api/leagues/${id}`);
      if (leagueRes.ok) {
        const leagueData = await leagueRes.json();
        setLeague(leagueData);
      }

      // Check if admin
      const membersRes = await fetch(`/api/leagues/${id}/members`);
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        const currentUser = membersData.members?.find((m: { is_current_user?: boolean }) => m.is_current_user);
        setIsAdmin(currentUser?.role === "owner" || currentUser?.role === "admin");
      }

      // Fetch squares data
      const squaresRes = await fetch(`/api/leagues/${id}/squares`);
      if (squaresRes.ok) {
        const data = await squaresRes.json();
        setGrid(data.grid);
        setSquares(data.squares || []);
        setScores(data.scores || []);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setError("Failed to load squares pool");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClaimSquare = async (row: number, col: number) => {
    if (!grid || grid.status !== "open" || isActing) return;
    
    setIsActing(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/leagues/${id}/squares/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, col }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to claim square");
      }
      
      // Refresh data
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim square");
    } finally {
      setIsActing(false);
    }
  };

  const handleReleaseSquare = async (row: number, col: number) => {
    if (!grid || grid.status !== "open" || isActing) return;
    
    setIsActing(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/leagues/${id}/squares/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, col }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to release square");
      }
      
      await fetchData();
      setSelectedSquare(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release square");
    } finally {
      setIsActing(false);
    }
  };

  const handleRevealNumbers = async () => {
    if (!isAdmin || isActing) return;
    
    if (!confirm("Are you sure you want to reveal the numbers? This will lock the grid and no more squares can be claimed.")) {
      return;
    }
    
    setIsActing(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/leagues/${id}/squares/reveal-numbers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reveal numbers");
      }
      
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reveal numbers");
    } finally {
      setIsActing(false);
    }
  };

  const handleSquareClick = (row: number, col: number) => {
    const square = squares.find(s => s.row_num === row && s.col_num === col);
    
    if (!square) return;
    
    if (square.is_current_user) {
      setSelectedSquare({ row, col });
    } else if (!square.owner_id && grid?.status === "open") {
      handleClaimSquare(row, col);
    } else if (square.owner_id) {
      setSelectedSquare({ row, col });
    }
  };

  // Calculate stats
  const userSquares = squares.filter(s => s.is_current_user);
  const takenSquares = squares.filter(s => s.owner_id !== null);
  const availableSquares = squares.filter(s => s.owner_id === null);
  const pricePerSquare = grid?.price_per_square_cents || 0;
  const totalPot = takenSquares.length * pricePerSquare;

  // Find user wins
  const userWins = scores.filter(s => {
    if (!s.winning_square_id) return false;
    const winningSquare = squares.find(sq => sq.id === s.winning_square_id);
    return winningSquare?.is_current_user;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!league) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">League not found</p>
        <Link to="/">
          <button className="btn-secondary mt-4">Back to Dashboard</button>
        </Link>
      </div>
    );
  }

  // No grid created yet
  if (!grid) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-page-enter">
        <div className="flex items-start gap-4">
          <Link to="/">
            <button className="btn-icon mt-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-h1">{league.name}</h1>
            <p className="text-muted-foreground">Squares Pool</p>
          </div>
        </div>
        
        <div className="card-hero text-center py-12">
          <Grid3X3 className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-h2 mb-2">No Grid Setup Yet</h2>
          <p className="text-muted-foreground mb-6">
            {isAdmin 
              ? "Create a squares grid to get started" 
              : "The pool admin hasn't set up the squares grid yet"}
          </p>
          {isAdmin && (
            <Link to={`/leagues/${id}/admin`}>
              <button className="btn-cta">Set Up Grid</button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  const homeTeam = grid.home_team;
  const awayTeam = grid.away_team;
  const rowNumbers = grid.row_numbers || [];
  const colNumbers = grid.col_numbers || [];
  const numbersRevealed = grid.is_numbers_revealed;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link to="/">
            <button className="btn-icon mt-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SportBadge sport={league.sport_key} format="Squares" />
            </div>
            <h1 className="text-h1">{league.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchData} 
            className="btn-icon"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </button>
          <StatusPill status={grid.status === "open" ? "open" : "locked"} />
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Game Info Card */}
      <div className="card-hero">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl"
              style={{ background: getTeamColor(awayTeam) }}
            >
              {awayTeam.slice(0, 2).toUpperCase()}
            </div>
            <div className="text-center">
              <div className="text-caption">vs</div>
              <div className="text-2xl font-bold">@</div>
            </div>
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl"
              style={{ background: getTeamColor(homeTeam) }}
            >
              {homeTeam.slice(0, 2).toUpperCase()}
            </div>
          </div>
          
          <div className="text-right">
            {grid.game_date && (
              <div className="text-caption flex items-center gap-1 justify-end">
                <Clock className="w-3.5 h-3.5" />
                {grid.game_date} {grid.game_time && `• ${grid.game_time}`}
              </div>
            )}
            {grid.venue && (
              <div className="text-sm font-medium text-muted-foreground">
                {grid.venue}
              </div>
            )}
          </div>
        </div>

        {/* Quarter Scores */}
        <div className="grid grid-cols-4 gap-2">
          {scores.filter(s => s.quarter !== "Final").map((q) => {
            const winningSquare = q.winning_square_id 
              ? squares.find(s => s.id === q.winning_square_id) 
              : null;
            const isUserWin = winningSquare?.is_current_user;
            
            return (
              <div 
                key={q.quarter}
                className={cn(
                  "p-3 rounded-xl text-center border-2 transition-all",
                  isUserWin 
                    ? "border-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]"
                    : q.home_score !== null 
                      ? "border-border bg-secondary/50"
                      : "border-dashed border-border"
                )}
              >
                <div className="text-caption">{q.quarter}</div>
                {q.home_score !== null ? (
                  <>
                    <div className="text-lg font-bold tabular-nums">
                      {q.away_score}-{q.home_score}
                    </div>
                    <div className={cn(
                      "text-xs mt-1",
                      isUserWin ? "text-[hsl(var(--success))] font-semibold" : "text-muted-foreground"
                    )}>
                      {isUserWin ? "🎉 You won!" : winningSquare?.owner_name || "No winner"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-muted-foreground">--</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(totalPot / 4)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card-premium p-4 text-center">
          <div className="text-2xl font-bold text-primary">{userSquares.length}</div>
          <div className="text-caption">Your Squares</div>
        </div>
        <div className="card-premium p-4 text-center">
          <div className="text-2xl font-bold">{takenSquares.length}</div>
          <div className="text-caption">Sold</div>
        </div>
        <div className="card-premium p-4 text-center">
          <div className="text-2xl font-bold text-muted-foreground">{availableSquares.length}</div>
          <div className="text-caption">Available</div>
        </div>
        <div className="card-premium p-4 text-center">
          <div className="text-2xl font-bold text-[hsl(var(--success))]">
            {formatCurrency(totalPot)}
          </div>
          <div className="text-caption">Total Pot</div>
        </div>
      </div>

      {/* Admin Actions */}
      {isAdmin && grid.status === "open" && (
        <div className="card-premium p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Admin Actions</h3>
            <p className="text-sm text-muted-foreground">
              {takenSquares.length}/100 squares claimed
            </p>
          </div>
          <button 
            onClick={handleRevealNumbers}
            disabled={isActing || takenSquares.length < 10}
            className="btn-secondary flex items-center gap-2"
          >
            <Shuffle className="h-4 w-4" />
            Reveal Numbers & Lock Grid
          </button>
        </div>
      )}

      {/* The Grid */}
      <div className="card-hero overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h3 flex items-center gap-2">
            <Grid3X3 className="w-5 h-5" />
            Squares Grid
            {grid.status === "locked" && (
              <Lock className="w-4 h-4 text-muted-foreground" />
            )}
          </h2>
          {pricePerSquare > 0 && (
            <div className="text-caption">
              {formatCurrency(pricePerSquare)} per square
            </div>
          )}
        </div>

        <div className="min-w-[500px]">
          {/* Column headers (Away team numbers) */}
          <div className="flex">
            <div className="w-12 h-10 flex items-center justify-center" />
            <div 
              className="flex-1 h-10 flex items-center justify-center text-white font-bold rounded-t-lg mx-0.5"
              style={{ background: getTeamColor(awayTeam) }}
            >
              {awayTeam}
            </div>
          </div>
          <div className="flex mb-1">
            <div className="w-12" />
            {[0,1,2,3,4,5,6,7,8,9].map((i) => (
              <div 
                key={i}
                className={cn(
                  "flex-1 h-8 flex items-center justify-center font-bold text-sm",
                  numbersRevealed ? "text-foreground" : "text-muted-foreground"
                )}
                style={{ 
                  background: numbersRevealed ? `${getTeamColor(awayTeam)}20` : undefined 
                }}
              >
                {numbersRevealed ? colNumbers[i] : "?"}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          <div className="flex">
            {/* Row headers (Home team numbers) */}
            <div className="flex flex-col mr-1">
              <div 
                className="w-12 flex items-center justify-center text-white font-bold writing-vertical rounded-l-lg"
                style={{ 
                  background: getTeamColor(homeTeam),
                  writingMode: "vertical-rl",
                  textOrientation: "mixed",
                  height: "100%"
                }}
              >
                {homeTeam}
              </div>
            </div>
            <div className="flex flex-col mr-1">
              {[0,1,2,3,4,5,6,7,8,9].map((i) => (
                <div 
                  key={i}
                  className={cn(
                    "w-8 h-10 flex items-center justify-center font-bold text-sm",
                    numbersRevealed ? "text-foreground" : "text-muted-foreground"
                  )}
                  style={{ 
                    background: numbersRevealed ? `${getTeamColor(homeTeam)}20` : undefined 
                  }}
                >
                  {numbersRevealed ? rowNumbers[i] : "?"}
                </div>
              ))}
            </div>

            {/* Squares grid */}
            <div className="flex-1 grid grid-cols-10 gap-0.5">
              {[0,1,2,3,4,5,6,7,8,9].flatMap(row => 
                [0,1,2,3,4,5,6,7,8,9].map(col => {
                  const square = squares.find(s => s.row_num === row && s.col_num === col);
                  const isSelected = selectedSquare?.row === row && selectedSquare?.col === col;
                  const isWinner = square && (
                    square.is_q1_winner || square.is_q2_winner || 
                    square.is_q3_winner || square.is_q4_winner || square.is_final_winner
                  );
                  
                  return (
                    <button
                      key={`${row}-${col}`}
                      onClick={() => handleSquareClick(row, col)}
                      disabled={isActing}
                      className={cn(
                        "h-10 rounded transition-all text-[10px] font-medium truncate px-0.5",
                        "border hover:border-primary/50 active:scale-95",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        square?.is_current_user 
                          ? "bg-primary/20 border-primary text-primary"
                          : square?.owner_id 
                            ? "bg-secondary border-border text-muted-foreground"
                            : grid.status === "open"
                              ? "bg-background border-border hover:bg-secondary/50 cursor-pointer"
                              : "bg-muted/30 border-border cursor-default",
                        isSelected && "ring-2 ring-primary",
                        isWinner && "ring-2 ring-[hsl(var(--success))] bg-[hsl(var(--success)/0.2)]"
                      )}
                    >
                      {square?.is_current_user ? (
                        <Check className="w-3.5 h-3.5 mx-auto" />
                      ) : square?.owner_name ? (
                        <span className="block truncate">{square.owner_name.split(" ")[0]}</span>
                      ) : grid.status === "open" ? (
                        <DollarSign className="w-3 h-3 mx-auto text-muted-foreground/50" />
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-primary/20 border border-primary" />
            <span>Your Squares</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-secondary border border-border" />
            <span>Taken</span>
          </div>
          {grid.status === "open" && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-background border border-border" />
              <span>Available</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[hsl(var(--success)/0.2)] ring-2 ring-[hsl(var(--success))]" />
            <span>Winner</span>
          </div>
        </div>
      </div>

      {/* Selected Square Detail */}
      {selectedSquare && (
        <div className="card-premium p-5">
          {(() => {
            const square = squares.find(
              s => s.row_num === selectedSquare.row && s.col_num === selectedSquare.col
            );
            if (!square) return null;
            
            const rowNum = numbersRevealed ? rowNumbers[selectedSquare.row] : "?";
            const colNum = numbersRevealed ? colNumbers[selectedSquare.col] : "?";
            
            return (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-caption mb-1">
                    Row {selectedSquare.row + 1}, Column {selectedSquare.col + 1}
                  </div>
                  <div className="font-mono font-bold text-lg">
                    {homeTeam} {rowNum} - {awayTeam} {colNum}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {square.owner_name || "Unclaimed"}
                  </div>
                </div>
                <div className="flex gap-2">
                  {square.is_current_user && grid.status === "open" && (
                    <button
                      onClick={() => handleReleaseSquare(selectedSquare.row, selectedSquare.col)}
                      disabled={isActing}
                      className="btn-secondary text-destructive"
                    >
                      Release Square
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedSquare(null)}
                    className="btn-ghost"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Your Squares Summary */}
      {userSquares.length > 0 && (
        <div className="card-premium p-5">
          <h3 className="text-h3 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Your Squares ({userSquares.length})
            {userWins.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))] text-xs font-medium">
                {userWins.length} win{userWins.length !== 1 ? "s" : ""}!
              </span>
            )}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {userSquares.map((square) => {
              const rowNum = numbersRevealed ? rowNumbers[square.row_num] : "?";
              const colNum = numbersRevealed ? colNumbers[square.col_num] : "?";
              const isWinner = square.is_q1_winner || square.is_q2_winner || 
                              square.is_q3_winner || square.is_q4_winner || square.is_final_winner;
              
              return (
                <div 
                  key={square.id}
                  className={cn(
                    "p-3 rounded-xl text-center border",
                    isWinner 
                      ? "border-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]"
                      : "border-primary/30 bg-primary/10"
                  )}
                >
                  <div className="text-caption mb-1">
                    {homeTeam} {rowNum} - {awayTeam} {colNum}
                  </div>
                  <div className={cn(
                    "font-mono font-bold text-lg",
                    isWinner ? "text-[hsl(var(--success))]" : "text-primary"
                  )}>
                    {rowNum}-{colNum}
                  </div>
                  {isWinner && (
                    <div className="text-xs text-[hsl(var(--success))] font-semibold mt-1">
                      🎉 Winner!
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-caption text-center mt-4">
            You win if the last digit of each team's score matches your square at the end of any quarter
          </p>
        </div>
      )}

      {/* Buy More Squares CTA */}
      {grid.status === "open" && availableSquares.length > 0 && (
        <div className="card-hero text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-h3 mb-2">
            {userSquares.length === 0 ? "Claim Your Squares!" : "Want More Squares?"}
          </h3>
          <p className="text-muted-foreground mb-4">
            {availableSquares.length} squares still available
            {pricePerSquare > 0 && ` at ${formatCurrency(pricePerSquare)} each`}
          </p>
          <p className="text-sm text-muted-foreground">
            Click any available square on the grid above to claim it
          </p>
        </div>
      )}

      {/* Pool Members */}
      <div className="card-premium p-5">
        <h3 className="text-h3 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Square Owners
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {Array.from(
            new Map(
              squares
                .filter(s => s.owner_id && s.owner_name)
                .map(s => [s.owner_id, s.owner_name])
            )
          ).map(([ownerId, ownerName]) => {
            const count = squares.filter(s => s.owner_id === ownerId).length;
            const isCurrentUser = squares.find(s => s.owner_id === ownerId)?.is_current_user;
            
            return (
              <div 
                key={ownerId}
                className={cn(
                  "p-2 rounded-lg text-sm text-center",
                  isCurrentUser ? "bg-primary/10 text-primary font-medium" : "bg-secondary"
                )}
              >
                {ownerName} ({count})
              </div>
            );
          })}
        </div>
        {takenSquares.length === 0 && (
          <p className="text-center text-muted-foreground py-4">
            No squares claimed yet. Be the first!
          </p>
        )}
      </div>
    </div>
  );
}
