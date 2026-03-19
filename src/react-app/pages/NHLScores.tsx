import { useState, useEffect } from "react";
import { format, addDays, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Trophy, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import { Skeleton } from "@/react-app/components/ui/skeleton";

interface NHLGame {
  GameID: number;
  Status: string;
  DateTime: string;
  AwayTeam: string;
  HomeTeam: string;
  AwayTeamScore: number | null;
  HomeTeamScore: number | null;
  Period: string | null;
  TimeRemainingMinutes: number | null;
  TimeRemainingSeconds: number | null;
  IsClosed: boolean;
  Channel: string | null;
  StadiumID: number | null;
}

interface BoxScoreGame {
  Game: NHLGame;
  Periods: Array<{
    PeriodID: number;
    GameID: number;
    Number: number;
    Name: string;
    AwayScore: number;
    HomeScore: number;
  }>;
  TeamGames: Array<{
    TeamID: number;
    Team: string;
    Goals: number;
    Assists: number;
    Shots: number;
    PowerPlayGoals: number;
    PenaltyMinutes: number;
    Hits: number;
    FaceoffsWon: number;
    Giveaways: number;
    Takeaways: number;
  }>;
}

// Format date for SportsData API (YYYY-MMM-DD)
function formatDateForAPI(date: Date): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const year = date.getFullYear();
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function GameStatusBadge({ game }: { game: NHLGame }) {
  if (game.IsClosed) {
    return (
      <Badge variant="secondary" className="bg-zinc-700 text-zinc-300">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Final
      </Badge>
    );
  }
  
  if (game.Status === "InProgress") {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse">
        <span className="w-2 h-2 bg-red-500 rounded-full mr-1.5" />
        LIVE
      </Badge>
    );
  }
  
  if (game.Status === "Scheduled") {
    return (
      <Badge variant="outline" className="text-zinc-400 border-zinc-600">
        <Clock className="w-3 h-3 mr-1" />
        {game.DateTime ? format(new Date(game.DateTime), "h:mm a") : "TBD"}
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" className="text-zinc-400">
      {game.Status}
    </Badge>
  );
}

function GameCard({ game, onSelect }: { game: NHLGame; onSelect: () => void }) {
  const isLive = game.Status === "InProgress";
  const isFinal = game.IsClosed;
  
  return (
    <Card 
      className={`bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer ${
        isLive ? "ring-1 ring-red-500/30" : ""
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <GameStatusBadge game={game} />
          {game.Channel && (
            <span className="text-xs text-zinc-500">{game.Channel}</span>
          )}
        </div>
        
        {/* Away Team */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-zinc-300">{game.AwayTeam.slice(0, 3)}</span>
            </div>
            <span className="font-medium text-white">{game.AwayTeam}</span>
          </div>
          <span className={`text-2xl font-bold ${
            isFinal && game.AwayTeamScore !== null && game.HomeTeamScore !== null && game.AwayTeamScore > game.HomeTeamScore 
              ? "text-emerald-400" 
              : "text-white"
          }`}>
            {game.AwayTeamScore ?? "-"}
          </span>
        </div>
        
        {/* Home Team */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-zinc-300">{game.HomeTeam.slice(0, 3)}</span>
            </div>
            <span className="font-medium text-white">{game.HomeTeam}</span>
          </div>
          <span className={`text-2xl font-bold ${
            isFinal && game.HomeTeamScore !== null && game.AwayTeamScore !== null && game.HomeTeamScore > game.AwayTeamScore 
              ? "text-emerald-400" 
              : "text-white"
          }`}>
            {game.HomeTeamScore ?? "-"}
          </span>
        </div>
        
        {/* Period Info for Live Games */}
        {isLive && game.Period && (
          <div className="mt-2 pt-2 border-t border-zinc-800 text-center">
            <span className="text-sm text-zinc-400">
              {game.Period} - {game.TimeRemainingMinutes}:{String(game.TimeRemainingSeconds || 0).padStart(2, "0")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BoxScoreModal({ gameId, onClose }: { gameId: number; onClose: () => void }) {
  const [boxScore, setBoxScore] = useState<BoxScoreGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBoxScore() {
      try {
        const res = await fetch(`/api/nhl/boxscore/${gameId}`);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch box score");
        }
        
        setBoxScore(data.boxScore);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load box score");
      } finally {
        setLoading(false);
      }
    }
    
    fetchBoxScore();
  }, [gameId]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <Card className="bg-zinc-900 border-zinc-700 max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-zinc-800">
          <CardTitle className="text-white">Box Score</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </CardHeader>
        <CardContent className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-red-400">{error}</p>
              <p className="text-sm text-zinc-500 mt-2">Make sure your SportsData API key is configured.</p>
            </div>
          ) : boxScore ? (
            <div className="space-y-6">
              {/* Scoring by Period */}
              {boxScore.Periods && boxScore.Periods.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">Scoring by Period</h3>
                  <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-700">
                          <th className="text-left p-2 text-zinc-400">Team</th>
                          {boxScore.Periods.map((p) => (
                            <th key={p.PeriodID} className="text-center p-2 text-zinc-400">{p.Name}</th>
                          ))}
                          <th className="text-center p-2 text-zinc-400 font-bold">T</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-zinc-700/50">
                          <td className="p-2 font-medium text-white">{boxScore.Game.AwayTeam}</td>
                          {boxScore.Periods.map((p) => (
                            <td key={p.PeriodID} className="text-center p-2 text-zinc-300">{p.AwayScore}</td>
                          ))}
                          <td className="text-center p-2 font-bold text-white">{boxScore.Game.AwayTeamScore}</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-medium text-white">{boxScore.Game.HomeTeam}</td>
                          {boxScore.Periods.map((p) => (
                            <td key={p.PeriodID} className="text-center p-2 text-zinc-300">{p.HomeScore}</td>
                          ))}
                          <td className="text-center p-2 font-bold text-white">{boxScore.Game.HomeTeamScore}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {/* Team Stats */}
              {boxScore.TeamGames && boxScore.TeamGames.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">Team Statistics</h3>
                  <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-700">
                          <th className="text-left p-2 text-zinc-400">Stat</th>
                          {boxScore.TeamGames.map((t) => (
                            <th key={t.TeamID} className="text-center p-2 text-zinc-400">{t.Team}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-zinc-300">
                        <tr className="border-b border-zinc-700/50">
                          <td className="p-2">Shots</td>
                          {boxScore.TeamGames.map((t) => (
                            <td key={t.TeamID} className="text-center p-2">{t.Shots}</td>
                          ))}
                        </tr>
                        <tr className="border-b border-zinc-700/50">
                          <td className="p-2">Power Play Goals</td>
                          {boxScore.TeamGames.map((t) => (
                            <td key={t.TeamID} className="text-center p-2">{t.PowerPlayGoals}</td>
                          ))}
                        </tr>
                        <tr className="border-b border-zinc-700/50">
                          <td className="p-2">Penalty Minutes</td>
                          {boxScore.TeamGames.map((t) => (
                            <td key={t.TeamID} className="text-center p-2">{t.PenaltyMinutes}</td>
                          ))}
                        </tr>
                        <tr className="border-b border-zinc-700/50">
                          <td className="p-2">Hits</td>
                          {boxScore.TeamGames.map((t) => (
                            <td key={t.TeamID} className="text-center p-2">{t.Hits}</td>
                          ))}
                        </tr>
                        <tr className="border-b border-zinc-700/50">
                          <td className="p-2">Faceoffs Won</td>
                          {boxScore.TeamGames.map((t) => (
                            <td key={t.TeamID} className="text-center p-2">{t.FaceoffsWon}</td>
                          ))}
                        </tr>
                        <tr className="border-b border-zinc-700/50">
                          <td className="p-2">Giveaways</td>
                          {boxScore.TeamGames.map((t) => (
                            <td key={t.TeamID} className="text-center p-2">{t.Giveaways}</td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-2">Takeaways</td>
                          {boxScore.TeamGames.map((t) => (
                            <td key={t.TeamID} className="text-center p-2">{t.Takeaways}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-zinc-400 text-center py-8">No box score data available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function NHLScores() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [games, setGames] = useState<NHLGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGames = async (date: Date) => {
    setLoading(true);
    setError(null);
    
    try {
      const dateStr = formatDateForAPI(date);
      const res = await fetch(`/api/nhl/games?date=${dateStr}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch games");
      }
      
      setGames(data.games || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load games");
      setGames([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGames(selectedDate);
  }, [selectedDate]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchGames(selectedDate);
  };

  const liveGames = games.filter(g => g.Status === "InProgress");
  const scheduledGames = games.filter(g => g.Status === "Scheduled");
  const completedGames = games.filter(g => g.IsClosed);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900/50 to-zinc-900 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">NHL Scores</h1>
              <p className="text-sm text-zinc-400">Live data from SportsRadar/provider feed</p>
            </div>
          </div>
          
          {/* Date Navigation */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedDate(d => subDays(d, 1))}
              className="border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 min-w-[180px] text-center">
              <span className="text-white font-medium">{format(selectedDate, "EEEE, MMM d")}</span>
            </div>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedDate(d => addDays(d, 1))}
              className="border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(new Date())}
              className="border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 ml-2"
            >
              Today
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className="ml-auto"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-40 bg-zinc-800/50" />
            ))}
          </div>
        ) : error ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Unable to Load Games</h3>
              <p className="text-zinc-400 mb-4">{error}</p>
              <p className="text-sm text-zinc-500 mb-4">
                Make sure your SPORTSDATA_API_KEY is configured in Settings → Secrets
              </p>
              <Button onClick={handleRefresh} variant="outline" className="border-zinc-700">
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : games.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="py-12 text-center">
              <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Games Scheduled</h3>
              <p className="text-zinc-400">No NHL games on {format(selectedDate, "MMMM d, yyyy")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Live Games */}
            {liveGames.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Live Now ({liveGames.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveGames.map(game => (
                    <GameCard 
                      key={game.GameID} 
                      game={game} 
                      onSelect={() => setSelectedGameId(game.GameID)} 
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Scheduled Games */}
            {scheduledGames.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-4">
                  Upcoming ({scheduledGames.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scheduledGames.map(game => (
                    <GameCard 
                      key={game.GameID} 
                      game={game} 
                      onSelect={() => setSelectedGameId(game.GameID)} 
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed Games */}
            {completedGames.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-4">
                  Final ({completedGames.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedGames.map(game => (
                    <GameCard 
                      key={game.GameID} 
                      game={game} 
                      onSelect={() => setSelectedGameId(game.GameID)} 
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Box Score Modal */}
      {selectedGameId && (
        <BoxScoreModal 
          gameId={selectedGameId} 
          onClose={() => setSelectedGameId(null)} 
        />
      )}
    </div>
  );
}
