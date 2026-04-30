import { useCallback, useMemo, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  DollarSign,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  User,
} from 'lucide-react';
import { OddsCard } from '@/react-app/components/OddsCard';
import { PlayerPhoto } from '@/react-app/components/PlayerPhoto';
import { cn } from '@/react-app/lib/utils';
import { toGameDetailPath } from '@/react-app/lib/gameRoutes';
import { useSafeDataLoader } from '@/react-app/lib/useSafeDataLoader';

interface TeamData {
  abbr: string;
  name?: string;
}

interface OddsData {
  spread?: number;
  spreadHome?: number;
  spreadOpen?: number;
  total?: number;
  overUnder?: number;
  totalOpen?: number;
  mlHome?: number;
  homeML?: number;
  mlAway?: number;
  awayML?: number;
  f5?: {
    spread?: {
      home?: number | null;
      away?: number | null;
    };
    total?: number | null;
    moneyline?: {
      home?: number | null;
      away?: number | null;
    };
  };
}

interface Game {
  id: string;
  gameId?: string;
  sport: string;
  league?: string | null;
  homeTeam: string | TeamData;
  awayTeam: string | TeamData;
  homeScore?: number | null;
  awayScore?: number | null;
  status: 'live' | 'scheduled' | 'final' | 'LIVE' | 'SCHEDULED' | 'FINAL';
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string | null;
  spread?: number;
  overUnder?: number;
  moneylineHome?: number;
  moneylineAway?: number;
  odds?: OddsData;
}

interface TicketHandleSplitRow {
  game_id: string;
  market: 'SPREAD' | 'TOTAL' | 'MONEYLINE';
  side: 'HOME' | 'AWAY' | 'OVER' | 'UNDER';
  tickets_pct: number | null;
  handle_pct: number | null;
}

interface OddsIntelligenceDashboardProps {
  games: Game[];
  groupedSections?: Array<{
    sport: string;
    label: string;
    count: number;
    games: Game[];
  }>;
  propsFeed?: Array<{
    id?: number | string;
    player_name?: string;
    team?: string | null;
    sport?: string;
    prop_type?: string;
    line_value?: number;
    movement?: number | null;
    odds_american?: number | null;
  }>;
  projectionFeed?: Array<{
    game_id?: string;
    provider_game_id?: string | null;
    sport?: string;
    player_name?: string;
    prop_type?: string;
    line_value?: number;
    projected_value?: number;
    edge_vs_line?: number;
    confidence?: "low" | "medium" | "high";
  }>;
  splitFeedByGame?: Record<string, TicketHandleSplitRow[]>;
  isGameInWatchboard: (gameId: string) => boolean;
  onWatchboardClick: (game: Game) => void;
  selectedSport: string;
  showMoreSections: Record<string, number>;
  setShowMoreSections: Dispatch<SetStateAction<Record<string, number>>>;
  modulesLoading?: boolean;
  propsLoading?: boolean;
}

type SharpSignal = {
  gameId: string;
  sport: string;
  matchup: string;
  openLine: number;
  currentLine: number;
  move: number;
  confidence: "steam" | "sharp" | "lean";
};

type SmartEntry = {
  gameId: string;
  sport: string;
  matchup: string;
  market: string;
  side: string;
  tickets: number;
  handle: number;
  diff: number;
};

type ValueEntry = {
  gameId: string;
  sport: string;
  player: string;
  propType: string;
  line: number;
  projected: number;
  edge: number;
  confidence: "low" | "medium" | "high";
};

type PropEntry = {
  id: string;
  player: string;
  playerId?: string;
  photoUrl?: string | null;
  team: string;
  sport: string;
  propType: string;
  line: number;
  odds: number;
  movement: number;
};

const getTeamAbbr = (team: string | TeamData): string => (typeof team === 'string' ? team : team.abbr || team.name || 'TBD');
const matchupLabel = (game: Game): string => `${getTeamAbbr(game.awayTeam)} @ ${getTeamAbbr(game.homeTeam)}`;

function parseSpreadMove(game: Game): { open: number; current: number; move: number } | null {
  const current = Number(game.odds?.spread ?? game.odds?.spreadHome ?? game.spread);
  const open = Number(game.odds?.spreadOpen);
  if (!Number.isFinite(current) || !Number.isFinite(open)) return null;
  return { open, current, move: current - open };
}

function generateSharpSignals(games: Game[]): SharpSignal[] {
  return games
    .map((game) => {
      const spreadMove = parseSpreadMove(game);
      if (!spreadMove || Math.abs(spreadMove.move) < 0.5) return null;
      const absMove = Math.abs(spreadMove.move);
      return {
        gameId: game.id,
        sport: String(game.sport || '').toLowerCase(),
        matchup: matchupLabel(game),
        openLine: spreadMove.open,
        currentLine: spreadMove.current,
        move: absMove,
        confidence: absMove >= 1.5 ? "steam" : absMove >= 1.0 ? "sharp" : "lean",
      } as SharpSignal;
    })
    .filter((row): row is SharpSignal => row !== null)
    .sort((a, b) => b.move - a.move)
    .slice(0, 6);
}

function generateSmartMoney(games: Game[], splitFeedByGame: Record<string, TicketHandleSplitRow[]>): SmartEntry[] {
  return games
    .flatMap((game) => {
      const rows = splitFeedByGame[game.id] || [];
      return rows
        .filter((row) => Number.isFinite(row.handle_pct) && Number.isFinite(row.tickets_pct))
        .map((row) => {
          const tickets = Number(row.tickets_pct);
          const handle = Number(row.handle_pct);
          return {
            gameId: game.id,
            sport: String(game.sport || '').toLowerCase(),
            matchup: matchupLabel(game),
            market: row.market,
            side: row.side,
            tickets,
            handle,
            diff: Math.abs(handle - tickets),
          } as SmartEntry;
        });
    })
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 6);
}

function generateValueEntries(games: Game[], projectionFeed: OddsIntelligenceDashboardProps["projectionFeed"]): ValueEntry[] {
  if (!Array.isArray(projectionFeed)) return [];
  const validGameIds = new Set(games.map((game) => game.id));
  return projectionFeed
    .map((row) => {
      const gameId = String(row.provider_game_id || row.game_id || '').trim();
      const edge = Number(row.edge_vs_line);
      const line = Number(row.line_value);
      const projected = Number(row.projected_value);
      if (!gameId || !validGameIds.has(gameId) || !Number.isFinite(edge) || !Number.isFinite(line) || !Number.isFinite(projected)) {
        return null;
      }
      return {
        gameId,
        sport: String(row.sport || '').toLowerCase(),
        player: String(row.player_name || '').trim(),
        propType: String(row.prop_type || 'PROP'),
        line,
        projected,
        edge: Math.abs(edge),
        confidence: row.confidence || "low",
      } as ValueEntry;
    })
    .filter((row): row is ValueEntry => row !== null && Boolean(row.player))
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 6);
}

function generateProps(games: Game[], propsFeed: OddsIntelligenceDashboardProps["propsFeed"]): PropEntry[] {
  if (!Array.isArray(propsFeed)) return [];
  const sports = new Set(games.map((g) => String(g.sport || '').toUpperCase()));
  const byMarket = new Map<string, PropEntry>();
  const toKey = (value: unknown): string => String(value || '').trim().toLowerCase();
  for (const row of propsFeed) {
    const sport = String(row?.sport || '').toUpperCase();
    if (!sports.has(sport)) continue;
    const line = Number(row?.line_value);
    if (!Number.isFinite(line)) continue;
    const player = String(row?.player_name || '').trim();
    if (!player) continue;
    const propType = String(row?.prop_type || 'PROP');
    const team = String(row?.team || '').trim() || 'TEAM';
    const odds = Number.isFinite(Number(row?.odds_american)) ? Number(row?.odds_american) : -110;
    const movement = Number.isFinite(Number(row?.movement)) ? Number(row?.movement) : 0;
    const gameId = String((row as any)?.game_id || (row as any)?.provider_game_id || '').trim().toLowerCase() || 'unknown-game';
    const marketKey = `${sport}|${gameId}|${player.toLowerCase()}|${propType.toLowerCase()}`;
    const nextEntry: PropEntry = {
      id: String((row as any)?.id || `${marketKey}|${line}`),
      player,
      playerId: String((row as any)?.player_id || '').trim() || undefined,
      photoUrl: String((row as any)?.photo_url || '').trim() || null,
      team,
      sport,
      propType,
      line,
      odds,
      movement,
    };
    const prev = byMarket.get(marketKey);
    if (!prev) {
      byMarket.set(marketKey, nextEntry);
      continue;
    }
    const prevMovement = Math.abs(Number(prev.movement || 0));
    const nextMovement = Math.abs(Number(nextEntry.movement || 0));
    if (
      nextMovement > prevMovement ||
      (nextMovement === prevMovement && Math.abs(nextEntry.odds) < Math.abs(prev.odds))
    ) {
      byMarket.set(marketKey, nextEntry);
    }
  }
  const ranked = Array.from(byMarket.values())
    .sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement))
    .slice(0, 20);
  const selected: PropEntry[] = [];
  const perPlayerCount = new Map<string, number>();
  for (const row of ranked) {
    const playerKey = toKey(row.player);
    const used = perPlayerCount.get(playerKey) || 0;
    if (used >= 2) continue;
    selected.push(row);
    perPlayerCount.set(playerKey, used + 1);
    if (selected.length >= 10) break;
  }
  if (selected.length < 10) {
    for (const row of ranked) {
      if (selected.length >= 10) break;
      if (selected.some((existing) => existing.id === row.id)) continue;
      selected.push(row);
    }
  }
  return selected;
}

function sectionTitleIcon(title: string) {
  if (title === 'Sharp Radar') return <Activity className="h-4 w-4 text-cyan-300" />;
  if (title === 'Smart Money Tracker') return <DollarSign className="h-4 w-4 text-emerald-300" />;
  if (title === 'Value Board') return <Target className="h-4 w-4 text-amber-300" />;
  if (title === 'Props Explorer') return <User className="h-4 w-4 text-violet-300" />;
  return <TrendingUp className="h-4 w-4 text-slate-300" />;
}

function SectionCard({
  title,
  subtitle,
  tag,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  tag?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900/90 border border-slate-700/70">
            {sectionTitleIcon(title)}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="text-[11px] text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tag && (
            <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2 py-0.5 text-[10px] font-medium text-slate-300">
              {tag}
            </span>
          )}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

function SectionLoading({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{text}</span>
    </div>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
      {text}
    </div>
  );
}

function isLiveStatusValue(value: unknown): boolean {
  const compact = String(value || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  return (
    compact === 'live' ||
    compact === 'in_progress' ||
    compact === 'inprogress' ||
    compact.includes('live') ||
    compact.includes('progress') ||
    compact.includes('underway') ||
    compact.includes('ongoing')
  );
}

export function OddsIntelligenceDashboard({
  games,
  groupedSections = [],
  propsFeed = [],
  projectionFeed = [],
  splitFeedByGame = {},
  isGameInWatchboard,
  onWatchboardClick,
  selectedSport,
  showMoreSections,
  setShowMoreSections,
  modulesLoading = false,
  propsLoading = false,
}: OddsIntelligenceDashboardProps) {
  const navigate = useNavigate();
  const openPropsFromOdds = useCallback(() => {
    navigate('/props', {
      state: {
        from: '/odds',
        sport: 'ALL',
      },
    });
  }, [navigate]);

  const sortedGames = useMemo(
    () =>
      [...games].sort((a, b) => {
        const aLive = isLiveStatusValue(a.status);
        const bLive = isLiveStatusValue(b.status);
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;
        return new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime();
      }),
    [games]
  );

  const fallbackPropsLoader = useSafeDataLoader<any[]>(
    `odds:props-fallback:${selectedSport}`,
    async ({ signal }) => {
      const sportsToQuery = selectedSport === 'ALL'
        ? ['NBA', 'NHL', 'MLB']
        : [String(selectedSport || 'ALL').toUpperCase()];
      const results = await Promise.allSettled(
        sportsToQuery.map(async (sportKey) => {
          const res = await fetch(
            `/api/sports-data/props/today?sport=${encodeURIComponent(sportKey)}&limit=160&offset=0&fresh=1`,
            { credentials: 'include', signal }
          );
          if (!res.ok) return [];
          const payload = await res.json().catch(() => null) as { props?: any[] } | null;
          return Array.isArray(payload?.props) ? payload.props : [];
        })
      );
      const merged: any[] = [];
      const seen = new Set<string>();
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        for (const row of result.value) {
          const dedupeKey = [
            String((row as any)?.sport || '').toUpperCase(),
            String((row as any)?.game_id || (row as any)?.provider_game_id || '').toLowerCase(),
            String((row as any)?.player_name || '').toLowerCase(),
            String((row as any)?.prop_type || '').toLowerCase(),
          ].join('|');
          if (!dedupeKey || seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          merged.push(row);
        }
      }
      return merged;
    },
    {
      enabled: !(Array.isArray(propsFeed) && propsFeed.length > 0),
      timeoutMs: 7000,
      retries: 2,
      retryDelayMs: 800,
    }
  );

  const effectivePropsFeed = useMemo(
    () => (Array.isArray(propsFeed) && propsFeed.length > 0 ? propsFeed : (fallbackPropsLoader.data || [])),
    [propsFeed, fallbackPropsLoader.data]
  );

  const sharpSignals = useMemo(() => generateSharpSignals(sortedGames), [sortedGames]);
  const smartMoney = useMemo(() => generateSmartMoney(sortedGames, splitFeedByGame), [sortedGames, splitFeedByGame]);
  const valueEntries = useMemo(() => generateValueEntries(sortedGames, projectionFeed), [sortedGames, projectionFeed]);
  const propEntries = useMemo(() => generateProps(sortedGames, effectivePropsFeed), [sortedGames, effectivePropsFeed]);
  const liveGamesActive = useMemo(
    () => sortedGames.filter((game) => isLiveStatusValue(game.status)).length,
    [sortedGames]
  );
  const coachPresenceMessages = useMemo(() => {
    const messages: string[] = [];
    if (smartMoney.length > 0) messages.push('🔥 Sharp money detected');
    if (sharpSignals.length > 0) messages.push('📈 Line movement rising');
    messages.push(`⚡ ${liveGamesActive} live games`);
    if (messages.length === 0) messages.push('Live signals updating...');
    return messages.slice(0, 3);
  }, [liveGamesActive, sharpSignals.length, smartMoney.length]);

  const coachInsights = useMemo(() => {
    const insights: string[] = [];
    if (sharpSignals.length > 0) {
      insights.push(`Sharpest spread move: ${sharpSignals[0].matchup} (${sharpSignals[0].move.toFixed(1)} pts).`);
    }
    if (smartMoney.length > 0) {
      insights.push(`Largest handle edge: ${smartMoney[0].matchup} ${smartMoney[0].side} ${smartMoney[0].market}.`);
    }
    if (valueEntries.length > 0) {
      insights.push(`Top value edge: ${valueEntries[0].player} ${valueEntries[0].propType} (+${valueEntries[0].edge.toFixed(1)}).`);
    }
    if (insights.length === 0) {
      insights.push('Markets are active but movement signals are still building.');
    }
    return insights.slice(0, 3);
  }, [sharpSignals, smartMoney, valueEntries]);

  const boardKey = selectedSport === 'ALL' ? 'odds-board-all' : `odds-board-${selectedSport}`;
  const defaultVisible = selectedSport === 'ALL' ? 12 : 10;
  const visibleCount = showMoreSections[boardKey] || defaultVisible;
  const boardSections = useMemo(() => {
    if (Array.isArray(groupedSections) && groupedSections.length > 0) {
      return groupedSections.map((section) => {
        const orderedGames = [...(section.games || [])].sort((a, b) => {
          const aLive = isLiveStatusValue(a.status);
          const bLive = isLiveStatusValue(b.status);
          if (aLive && !bLive) return -1;
          if (!aLive && bLive) return 1;
          return new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime();
        });
        return {
          sport: section.sport,
          label: section.label,
          count: orderedGames.length,
          games: orderedGames.slice(0, visibleCount),
          hasMore: orderedGames.length > visibleCount,
          total: orderedGames.length,
        };
      }).filter((section) => section.games.length > 0);
    }
    return [{
      sport: selectedSport,
      label: selectedSport === 'ALL' ? 'All Sports' : selectedSport,
      count: sortedGames.length,
      games: sortedGames.slice(0, visibleCount),
      hasMore: visibleCount < sortedGames.length,
      total: sortedGames.length,
    }];
  }, [groupedSections, selectedSport, sortedGames, visibleCount]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/40 via-slate-950/60 to-violet-950/35 px-3.5 py-3 shadow-[0_0_18px_rgba(16,185,129,0.10)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-slate-900/90">
              <img src="/assets/coachg/coach-g-avatar.png" alt="Coach G" className="h-6 w-6 rounded-full object-cover" />
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-emerald-300/80" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-violet-300" />
                <p className="truncate text-[12px] font-semibold text-white">Coach G Live</p>
              </div>
              <p className="truncate text-[10px] text-slate-400">Live command center signals</p>
            </div>
          </div>
          <div className="flex max-w-[65%] items-center gap-1.5 overflow-x-auto whitespace-nowrap">
            {coachPresenceMessages.map((signal) => (
              <span
                key={signal}
                className="inline-flex h-6 items-center rounded-full border border-slate-700/80 bg-slate-900/80 px-2.5 text-[11px] text-slate-200"
              >
                {signal}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-1 mb-1 space-y-2">
        <div className="px-1">
          <h3 className="text-sm font-semibold text-white">🔥 Trending Props</h3>
          <p className="text-[11px] text-slate-400">Live player markets right now</p>
        </div>
        <SectionCard
          title="Props Explorer"
          subtitle="Live props near the top of the board."
          tag="Top props"
          action={(
            <button
              onClick={openPropsFromOdds}
              className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.18)] transition-all hover:bg-emerald-500/20"
            >
              View All Props
            </button>
          )}
        >
        {(propsLoading || fallbackPropsLoader.loading) ? (
          <SectionLoading text="Loading props markets..." />
        ) : propEntries.length === 0 ? (
          <SectionEmpty text="Live props updating..." />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {propEntries.slice(0, 6).map((prop) => (
              <button
                key={prop.id}
                onClick={openPropsFromOdds}
                className="w-full rounded-xl border border-violet-500/22 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-violet-950/25 px-3 py-3 text-left shadow-[0_0_12px_rgba(139,92,246,0.08)] transition-all duration-200 hover:scale-[1.01] hover:border-violet-400/35 hover:shadow-[0_0_16px_rgba(139,92,246,0.16)]"
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 rounded-full border border-violet-400/25 p-0.5 shadow-[0_0_10px_rgba(139,92,246,0.18)]">
                    <PlayerPhoto
                      playerName={prop.player}
                      playerId={prop.playerId}
                      photoUrl={prop.photoUrl}
                      sport={String(prop.sport || '').toLowerCase()}
                      size={36}
                      className="rounded-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-bold text-white">{prop.player}</p>
                      <span className="rounded-full border border-slate-700/80 bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-300">{prop.sport}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">{prop.team}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-300">{prop.propType}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                      <span className="font-semibold text-violet-200">LINE {prop.line}</span>
                      <span className="font-semibold text-amber-300">ODDS {prop.odds > 0 ? `+${prop.odds}` : prop.odds}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                      <span className={cn(prop.movement > 0 ? 'text-emerald-300' : prop.movement < 0 ? 'text-red-300' : 'text-slate-400')}>
                        Move {prop.movement > 0 ? '+' : ''}{prop.movement.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        </SectionCard>
      </section>

      <SectionCard title="Odds Board" subtitle="Real spread, total, and moneyline first.">
        <div className="space-y-4">
          {boardSections.map((section) => (
            <div key={section.sport} className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-300">
                  {section.label}
                </h4>
                <span className="rounded-full border border-slate-700/80 bg-slate-900/75 px-2 py-0.5 text-[10px] text-slate-400">
                  {section.total}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {section.games.map((game) => (
                  <OddsCard
                    key={game.id}
                    game={game}
                    isInWatchboard={isGameInWatchboard(game.id)}
                    onWatchboardClick={() => onWatchboardClick(game)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {boardSections.some((section) => section.hasMore) && (
          <button
            onClick={() => setShowMoreSections((prev) => ({
              ...prev,
              [boardKey]: Math.min(
                Math.max(...boardSections.map((section) => section.total)),
                visibleCount + defaultVisible
              ),
            }))}
            className="mt-3 w-full rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800/80"
          >
            Show more odds cards
          </button>
        )}
      </SectionCard>

      <section className="rounded-2xl border border-violet-400/30 bg-gradient-to-r from-violet-950/65 via-slate-950/55 to-indigo-950/45 px-4 py-3.5 shadow-[0_0_20px_rgba(139,92,246,0.15)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-violet-300/35 bg-slate-900/95 shadow-[0_0_16px_rgba(139,92,246,0.22)]">
              <img src="/assets/coachg/coach-g-avatar.png" alt="Coach G" className="h-11 w-11 rounded-full object-cover" />
              <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.95)]" />
              <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 animate-ping rounded-full bg-emerald-300/80" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-300" />
                <h3 className="text-base font-semibold text-white">Coach G Live</h3>
              </div>
              <p className="mt-1 text-[12px] text-violet-200/80">Markets active. Signals building.</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Tracking live movement across slate.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/scout')}
            className="rounded-lg border border-violet-400/35 bg-violet-500/12 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/24"
          >
            Open Coach G
          </button>
        </div>
        <div className="mt-3 space-y-1.5">
          {coachInsights.map((insight) => (
            <div key={insight} className="flex items-start gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-xs text-slate-200">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 text-violet-300" />
              <span>{insight}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Sharp Radar" subtitle="Opening-to-current spread movement ranked by strength." tag="Top movement">
          {modulesLoading ? (
            <SectionLoading text="Scanning line movement..." />
          ) : sharpSignals.length === 0 ? (
            <SectionEmpty text="Tracking live market movement..." />
          ) : (
            <div className="space-y-2">
              {sharpSignals.map((signal) => (
                <button
                  key={signal.gameId}
                  onClick={() => navigate(toGameDetailPath(signal.sport, signal.gameId))}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 text-left hover:border-cyan-500/35"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white">{signal.matchup}</p>
                    <span className="text-[10px] uppercase text-cyan-300">{signal.confidence}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300">
                    {signal.openLine > 0 ? `+${signal.openLine.toFixed(1)}` : signal.openLine.toFixed(1)}
                    {' -> '}
                    {signal.currentLine > 0 ? `+${signal.currentLine.toFixed(1)}` : signal.currentLine.toFixed(1)}
                    <span className="ml-2 text-cyan-300">({signal.move.toFixed(1)} pts)</span>
                  </p>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Smart Money Tracker" subtitle="Handle vs tickets splits where available." tag="Strongest signal">
          {modulesLoading ? (
            <SectionLoading text="Loading split signals..." />
          ) : smartMoney.length === 0 ? (
            <SectionEmpty text="Tracking live market movement..." />
          ) : (
            <div className="space-y-2">
              {smartMoney.map((entry) => (
                <button
                  key={`${entry.gameId}-${entry.market}-${entry.side}`}
                  onClick={() => navigate(toGameDetailPath(entry.sport, entry.gameId))}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 text-left hover:border-emerald-500/35"
                >
                  <p className="text-xs font-semibold text-white">{entry.matchup}</p>
                  <p className="text-[11px] text-slate-400">{entry.side} {entry.market}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    <span className="text-slate-300">Handle {Math.round(entry.handle)}%</span>
                    <span className="text-slate-500">vs</span>
                    <span className="text-slate-300">Tickets {Math.round(entry.tickets)}%</span>
                    {entry.handle >= entry.tickets ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-300" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5 text-red-300" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Value Board" subtitle="Projection edge against current posted line." tag="Top value">
          {modulesLoading ? (
            <SectionLoading text="Calculating value edges..." />
          ) : valueEntries.length === 0 ? (
            <SectionEmpty text="Tracking live market movement..." />
          ) : (
            <div className="space-y-2">
              {valueEntries.map((entry) => (
                <button
                  key={`${entry.gameId}-${entry.player}-${entry.propType}`}
                  onClick={() => navigate(toGameDetailPath(entry.sport, entry.gameId))}
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 text-left hover:border-amber-500/35"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white">{entry.player}</p>
                    <span className="text-[10px] text-amber-300">+{entry.edge.toFixed(1)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{entry.propType} • line {entry.line.toFixed(1)} • proj {entry.projected.toFixed(1)}</p>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

export default OddsIntelligenceDashboard;
