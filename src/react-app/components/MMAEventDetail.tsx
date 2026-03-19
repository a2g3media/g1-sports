/**
 * Premium MMA Event Detail Component
 * World-class UFC fight card experience with fighter profiles and betting odds
 */

import { useState, useEffect, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Loader2, Trophy, MapPin, 
  ChevronDown, ChevronUp, Calendar, ArrowLeft,
  Users, Flame, Target, Shield, Clock, Zap
} from 'lucide-react';
import { Badge } from '@/react-app/components/ui/badge';
import { cn } from '@/react-app/lib/utils';

// Cinematic Background for UFC page
const CinematicBackground = memo(function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,18%,6%)] via-[hsl(220,20%,8%)] to-[hsl(220,18%,10%)]" />
      
      {/* UFC red accent glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-900/10 via-transparent to-transparent" />
      
      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />
    </div>
  );
});

// Types
interface Fighter {
  fighterId: number;
  firstName: string;
  lastName: string;
  nickname?: string;
  moneyline?: number;
  winner?: boolean;
  active?: boolean;
  preMatchWins?: number;
  preMatchLosses?: number;
  preMatchDraws?: number;
  // Enhanced fields (if available)
  height?: string;
  weight?: number;
  reach?: number;
  stance?: string;
  imageUrl?: string;
  nationality?: string;
  countryFlag?: string;
}

interface Fight {
  fightId: string;
  order: number;
  weightClass: string;
  cardSegment: string;
  status: string;
  rounds: number;
  resultClock?: string;
  resultRound?: number;
  resultType?: string;
  fighters: Fighter[];
}

interface FightOdds {
  fightId: string;
  sportsbooks: Array<{
    name: string;
    fighter1Moneyline?: number;
    fighter2Moneyline?: number;
    totalRoundsOver?: number;
    totalRoundsUnder?: number;
  }>;
}

interface MMAEvent {
  eventId: number;
  name: string;
  shortName?: string;
  dateTime: string;
  day?: string;
  status: string;
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
  active?: boolean;
}

interface MMAEventDetailProps {
  eventId: string;
  gameData?: {
    home_team_name?: string;
    start_time?: string;
    status?: string;
    venue?: string;
  };
}

// Premium Glass Card
const GlassCard = memo(function GlassCard({ 
  children, 
  className,
  variant = 'default'
}: { 
  children: React.ReactNode; 
  className?: string;
  variant?: 'default' | 'main-event' | 'main-card' | 'prelims';
}) {
  const variants = {
    default: 'ring-white/[0.06]',
    'main-event': 'ring-amber-500/30 shadow-lg shadow-amber-500/5',
    'main-card': 'ring-red-500/20',
    'prelims': 'ring-white/[0.04]',
  };
  
  return (
    <div className={cn(
      "relative rounded-2xl overflow-hidden ring-1",
      variants[variant],
      className
    )}>
      <div className="absolute inset-0 bg-[hsl(220,18%,8%)]" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
      <div className="relative">{children}</div>
    </div>
  );
});

// Fighter Avatar with photo support and initials fallback
const FighterAvatar = memo(function FighterAvatar({
  fighter,
  size = 'md',
  side,
}: {
  fighter: Fighter;
  size?: 'sm' | 'md' | 'lg';
  side: 'red' | 'blue';
}) {
  const [imgError, setImgError] = useState(false);
  const initials = `${fighter.firstName?.[0] || ''}${fighter.lastName?.[0] || ''}`;
  const sizeClasses = {
    sm: 'w-12 h-12 text-sm',
    md: 'w-20 h-20 text-xl',
    lg: 'w-28 h-28 text-3xl',
  };
  
  const cornerGradient = side === 'red' 
    ? 'from-red-600/30 via-red-500/10 to-transparent'
    : 'from-blue-600/30 via-blue-500/10 to-transparent';
  
  const cornerRing = side === 'red' ? 'ring-red-500/40' : 'ring-blue-500/40';
  
  const hasValidImage = fighter.imageUrl && !imgError;
  
  return (
    <div className={cn(
      "relative rounded-full ring-2 overflow-hidden flex items-center justify-center font-bold text-white",
      sizeClasses[size],
      cornerRing
    )}>
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br",
        cornerGradient
      )} />
      <div className="absolute inset-0 bg-[hsl(220,18%,12%)]" />
      
      {hasValidImage ? (
        <img 
          src={fighter.imageUrl}
          alt={`${fighter.firstName} ${fighter.lastName}`}
          className="relative z-10 w-full h-full object-cover object-top"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="relative z-10 text-white/80">{initials}</span>
      )}
    </div>
  );
});

// Format moneyline for display
function formatMoneyline(ml: number | undefined | null): string {
  if (ml === undefined || ml === null) return '-';
  return ml > 0 ? `+${ml}` : `${ml}`;
}

// Get fighter record string
function getRecord(f: Fighter): string {
  if (f.preMatchWins === undefined) return '';
  const wins = f.preMatchWins || 0;
  const losses = f.preMatchLosses || 0;
  const draws = f.preMatchDraws || 0;
  return `${wins}-${losses}${draws > 0 ? `-${draws}` : ''}`;
}

// Get implied probability from moneyline
function getImpliedProbability(ml: number | undefined): string {
  if (!ml) return '';
  const prob = ml > 0 
    ? 100 / (ml + 100) * 100
    : (-ml) / (-ml + 100) * 100;
  return `${Math.round(prob)}%`;
}

// Fighter Profile Card (Hero version for main event)
const FighterHeroCard = memo(function FighterHeroCard({
  fighter,
  moneyline,
  side,
  isWinner,
}: {
  fighter: Fighter;
  moneyline?: number;
  side: 'red' | 'blue';
  isWinner?: boolean;
}) {
  const record = getRecord(fighter);
  const impliedProb = getImpliedProbability(moneyline);
  
  const cornerColor = side === 'red' ? 'text-red-400' : 'text-blue-400';
  const cornerLabel = side === 'red' ? 'RED CORNER' : 'BLUE CORNER';
  const gradientDir = side === 'red' ? 'from-red-500/20' : 'from-blue-500/20';
  
  return (
    <div className={cn(
      "flex-1 relative overflow-hidden rounded-xl p-4",
      side === 'red' ? 'text-left' : 'text-right'
    )}>
      {/* Background gradient */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br to-transparent opacity-50",
        gradientDir
      )} />
      
      <div className={cn(
        "relative flex flex-col gap-3",
        side === 'blue' && "items-end"
      )}>
        {/* Corner label */}
        <span className={cn("text-[10px] font-bold tracking-widest uppercase", cornerColor)}>
          {cornerLabel}
        </span>
        
        {/* Avatar */}
        <FighterAvatar fighter={fighter} size="lg" side={side} />
        
        {/* Name & Country */}
        <div>
          <h3 className="text-xl font-bold text-white leading-tight">
            {fighter.firstName}
          </h3>
          <h3 className="text-2xl font-black text-white leading-tight uppercase tracking-wide">
            {fighter.lastName}
          </h3>
          {fighter.nickname && (
            <p className="text-sm text-white/50 italic mt-1">
              "{fighter.nickname}"
            </p>
          )}
          {/* Country flag & nationality */}
          {(fighter.countryFlag || fighter.nationality) && (
            <div className={cn(
              "flex items-center gap-1.5 mt-2",
              side === 'blue' && "justify-end"
            )}>
              {fighter.countryFlag && (
                <span className="text-lg">{fighter.countryFlag}</span>
              )}
              {fighter.nationality && (
                <span className="text-xs text-white/40 uppercase tracking-wider">
                  {fighter.nationality}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Record */}
        {record && (
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-white/40" />
            <span className="text-sm text-white/70 font-medium">{record}</span>
          </div>
        )}
        
        {/* Moneyline & Probability */}
        {moneyline !== undefined && moneyline !== null && (
          <div className={cn(
            "mt-2 p-3 rounded-lg",
            moneyline < 0 ? "bg-emerald-500/10" : "bg-white/5"
          )}>
            <div className={cn(
              "text-2xl font-bold",
              moneyline < 0 ? "text-emerald-400" : "text-white/70"
            )}>
              {formatMoneyline(moneyline)}
            </div>
            {impliedProb && (
              <div className="text-xs text-white/40 mt-0.5">
                {impliedProb} implied
              </div>
            )}
          </div>
        )}
        
        {/* Winner badge */}
        {isWinner && (
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Trophy className="w-3 h-3 mr-1.5" />
            WINNER
          </Badge>
        )}
      </div>
    </div>
  );
});

// Compact Fighter Row (for prelims)
const FighterCompactRow = memo(function FighterCompactRow({
  fighter,
  moneyline,
  side,
  isWinner,
}: {
  fighter: Fighter;
  moneyline?: number;
  side: 'red' | 'blue';
  isWinner?: boolean;
}) {
  const fighterName = `${fighter.firstName} ${fighter.lastName}`;
  const record = getRecord(fighter);
  
  return (
    <div className={cn(
      "flex items-center gap-3 flex-1 min-w-0",
      side === 'blue' && "flex-row-reverse"
    )}>
      <FighterAvatar fighter={fighter} size="sm" side={side} />
      
      <div className={cn(
        "flex-1 min-w-0",
        side === 'blue' && "text-right"
      )}>
        <div className="flex items-center gap-2">
          {side === 'blue' && isWinner && (
            <Trophy className="w-3 h-3 text-amber-400 flex-shrink-0" />
          )}
          {side === 'blue' && fighter.countryFlag && (
            <span className="text-sm flex-shrink-0">{fighter.countryFlag}</span>
          )}
          <span className="font-semibold text-white truncate">{fighterName}</span>
          {side === 'red' && fighter.countryFlag && (
            <span className="text-sm flex-shrink-0">{fighter.countryFlag}</span>
          )}
          {side === 'red' && isWinner && (
            <Trophy className="w-3 h-3 text-amber-400 flex-shrink-0" />
          )}
        </div>
        {record && (
          <span className="text-xs text-white/40">{record}</span>
        )}
      </div>
      
      {moneyline !== undefined && moneyline !== null && (
        <span className={cn(
          "text-sm font-bold flex-shrink-0",
          moneyline < 0 ? "text-emerald-400" : "text-white/50"
        )}>
          {formatMoneyline(moneyline)}
        </span>
      )}
    </div>
  );
});

// VS Badge
const VSBadge = memo(function VSBadge({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-12 h-12 text-xs',
    lg: 'w-16 h-16 text-sm',
  };
  
  return (
    <div className={cn(
      "relative flex items-center justify-center rounded-full bg-gradient-to-br from-white/10 to-white/5 ring-1 ring-white/20",
      sizeClasses[size]
    )}>
      <span className="font-black text-white/60 tracking-tighter">VS</span>
      <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent to-white/5" />
    </div>
  );
});

// Main Event Fight Card (Hero style)
const MainEventCard = memo(function MainEventCard({
  fight,
  odds,
}: {
  fight: Fight;
  odds?: FightOdds;
}) {
  const fighter1 = fight.fighters[0];
  const fighter2 = fight.fighters[1];
  const isFinal = fight.status?.toLowerCase() === 'final';
  
  const consensusOdds = odds?.sportsbooks?.find(s => 
    s.name?.toLowerCase().includes('consensus') || 
    s.name?.toLowerCase().includes('draftkings')
  ) || odds?.sportsbooks?.[0];
  
  if (!fighter1 || !fighter2) return null;
  
  return (
    <GlassCard variant="main-event" className="overflow-hidden">
      {/* Main Event Header */}
      <div className="relative px-4 py-3 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-transparent to-amber-500/10">
        <div className="flex items-center justify-center gap-3">
          <Flame className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-amber-400 uppercase tracking-[0.2em]">
            Main Event
          </span>
          <Flame className="w-4 h-4 text-amber-400" />
        </div>
        <div className="text-center mt-1">
          <span className="text-sm text-white/60">{fight.weightClass}</span>
          <span className="mx-2 text-white/20">•</span>
          <span className="text-sm text-white/60">{fight.rounds} Rounds</span>
        </div>
      </div>
      
      {/* Fighters */}
      <div className="p-4">
        <div className="flex items-stretch gap-4">
          <FighterHeroCard
            fighter={fighter1}
            moneyline={consensusOdds?.fighter1Moneyline}
            side="red"
            isWinner={fighter1.winner}
          />
          
          <div className="flex flex-col items-center justify-center">
            <VSBadge size="lg" />
          </div>
          
          <FighterHeroCard
            fighter={fighter2}
            moneyline={consensusOdds?.fighter2Moneyline}
            side="blue"
            isWinner={fighter2.winner}
          />
        </div>
        
        {/* Result */}
        {isFinal && fight.resultType && (
          <div className="mt-4 pt-4 border-t border-white/5 text-center">
            <Badge className="bg-white/10 text-white/80">
              {fight.resultType}
              {fight.resultRound && ` - Round ${fight.resultRound}`}
              {fight.resultClock && ` (${fight.resultClock})`}
            </Badge>
          </div>
        )}
        
        {/* Total Rounds Prop */}
        {consensusOdds?.totalRoundsOver && (
          <div className="mt-4 pt-4 border-t border-white/5 flex justify-center">
            <div className="px-4 py-2 rounded-lg bg-white/5 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
                Total Rounds
              </div>
              <div className="text-sm font-semibold text-white/70">
                O/U {consensusOdds.totalRoundsOver}
              </div>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
});

// Regular Fight Card (expandable)
const FightCard = memo(function FightCard({
  fight,
  odds,
  isExpanded,
  onToggle,
  isMainCard,
}: {
  fight: Fight;
  odds?: FightOdds;
  isExpanded: boolean;
  onToggle: () => void;
  isMainCard: boolean;
}) {
  const fighter1 = fight.fighters[0];
  const fighter2 = fight.fighters[1];
  const isFinal = fight.status?.toLowerCase() === 'final';
  
  const consensusOdds = odds?.sportsbooks?.find(s => 
    s.name?.toLowerCase().includes('consensus') || 
    s.name?.toLowerCase().includes('draftkings')
  ) || odds?.sportsbooks?.[0];
  
  if (!fighter1 || !fighter2) return null;
  
  return (
    <GlassCard variant={isMainCard ? 'main-card' : 'prelims'}>
      {/* Collapsed view - always visible */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
      >
        {/* Fight Order */}
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
          isMainCard 
            ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30" 
            : "bg-white/10 text-white/40"
        )}>
          {fight.order}
        </div>
        
        {/* Fighters */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <FighterCompactRow
              fighter={fighter1}
              moneyline={consensusOdds?.fighter1Moneyline}
              side="red"
              isWinner={fighter1.winner}
            />
            
            <VSBadge size="sm" />
            
            <FighterCompactRow
              fighter={fighter2}
              moneyline={consensusOdds?.fighter2Moneyline}
              side="blue"
              isWinner={fighter2.winner}
            />
          </div>
        </div>
        
        {/* Expand icon */}
        <div className="flex-shrink-0 text-white/30">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </button>
      
      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-white/5">
          <div className="pt-4 space-y-4">
            {/* Weight class & rounds */}
            <div className="flex items-center justify-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-white/50">
                <Shield className="w-4 h-4" />
                <span>{fight.weightClass}</span>
              </div>
              <span className="text-white/20">•</span>
              <div className="flex items-center gap-1.5 text-white/50">
                <Clock className="w-4 h-4" />
                <span>{fight.rounds} Rounds</span>
              </div>
            </div>
            
            {/* Detailed fighter cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* Fighter 1 */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/10">
                <div className="flex items-center gap-3 mb-3">
                  <FighterAvatar fighter={fighter1} size="md" side="red" />
                  <div>
                    <div className="font-bold text-white">
                      {fighter1.firstName} {fighter1.lastName}
                    </div>
                    {fighter1.nickname && (
                      <div className="text-xs text-white/40 italic">
                        "{fighter1.nickname}"
                      </div>
                    )}
                    {(fighter1.countryFlag || fighter1.nationality) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {fighter1.countryFlag && <span className="text-sm">{fighter1.countryFlag}</span>}
                        {fighter1.nationality && <span className="text-xs text-white/40">{fighter1.nationality}</span>}
                      </div>
                    )}
                  </div>
                </div>
                {getRecord(fighter1) && (
                  <div className="text-sm text-white/60 mb-2">
                    Record: {getRecord(fighter1)}
                  </div>
                )}
                {consensusOdds?.fighter1Moneyline !== undefined && (
                  <div className={cn(
                    "text-lg font-bold",
                    consensusOdds.fighter1Moneyline < 0 ? "text-emerald-400" : "text-white/60"
                  )}>
                    {formatMoneyline(consensusOdds.fighter1Moneyline)}
                  </div>
                )}
                {fighter1.winner && (
                  <Badge className="mt-2 bg-amber-500/20 text-amber-400">
                    <Trophy className="w-3 h-3 mr-1" /> Winner
                  </Badge>
                )}
              </div>
              
              {/* Fighter 2 */}
              <div className="p-4 rounded-xl bg-gradient-to-bl from-blue-500/10 to-transparent border border-blue-500/10">
                <div className="flex items-center gap-3 mb-3 justify-end">
                  <div className="text-right">
                    <div className="font-bold text-white">
                      {fighter2.firstName} {fighter2.lastName}
                    </div>
                    {fighter2.nickname && (
                      <div className="text-xs text-white/40 italic">
                        "{fighter2.nickname}"
                      </div>
                    )}
                    {(fighter2.countryFlag || fighter2.nationality) && (
                      <div className="flex items-center gap-1.5 mt-1 justify-end">
                        {fighter2.nationality && <span className="text-xs text-white/40">{fighter2.nationality}</span>}
                        {fighter2.countryFlag && <span className="text-sm">{fighter2.countryFlag}</span>}
                      </div>
                    )}
                  </div>
                  <FighterAvatar fighter={fighter2} size="md" side="blue" />
                </div>
                {getRecord(fighter2) && (
                  <div className="text-sm text-white/60 mb-2 text-right">
                    Record: {getRecord(fighter2)}
                  </div>
                )}
                {consensusOdds?.fighter2Moneyline !== undefined && (
                  <div className={cn(
                    "text-lg font-bold text-right",
                    consensusOdds.fighter2Moneyline < 0 ? "text-emerald-400" : "text-white/60"
                  )}>
                    {formatMoneyline(consensusOdds.fighter2Moneyline)}
                  </div>
                )}
                {fighter2.winner && (
                  <Badge className="mt-2 bg-amber-500/20 text-amber-400 ml-auto">
                    <Trophy className="w-3 h-3 mr-1" /> Winner
                  </Badge>
                )}
              </div>
            </div>
            
            {/* Result if final */}
            {isFinal && fight.resultType && (
              <div className="text-center pt-2">
                <Badge className="bg-white/10 text-white/70">
                  {fight.resultType}
                  {fight.resultRound && ` R${fight.resultRound}`}
                  {fight.resultClock && ` (${fight.resultClock})`}
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
});

// Card Segment Header
const SegmentHeader = memo(function SegmentHeader({
  title,
  count,
  variant,
}: {
  title: string;
  count: number;
  variant: 'main' | 'prelims';
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg",
        variant === 'main' 
          ? "bg-red-500/10 text-red-400"
          : "bg-white/5 text-white/50"
      )}>
        {variant === 'main' ? (
          <Zap className="w-4 h-4" />
        ) : (
          <Users className="w-4 h-4" />
        )}
        <span className="text-sm font-bold uppercase tracking-wider">{title}</span>
      </div>
      <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
      <span className="text-xs text-white/30">{count} fights</span>
    </div>
  );
});

// Main Component
export function MMAEventDetail({ eventId }: MMAEventDetailProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<MMAEvent | null>(null);
  const [fights, setFights] = useState<Fight[]>([]);
  const [odds, setOdds] = useState<FightOdds[]>([]);
  const [expandedFights, setExpandedFights] = useState<Set<string>>(new Set());
  
  // Extract provider_game_id from eventId
  const providerGameId = eventId.replace(/^sdio_mma_/i, '');
  
  useEffect(() => {
    async function fetchEventDetails() {
      setLoading(true);
      setError(null);
      
      try {
        let data: any = null;
        let res = await fetch(`/api/mma/event/${providerGameId}`);
        if (!res.ok) {
          // Backward-compatible fallback while old IDs still exist in links.
          res = await fetch(`/api/sports-data/mma/event/${providerGameId}`);
        }
        data = await res.json();
        
        if (data.error && !data.event && !data.fights?.length) {
          setError(data.error);
        } else {
          setEvent(data.event);
          setFights(data.fights || []);
          setOdds(data.odds || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load event');
      } finally {
        setLoading(false);
      }
    }
    
    fetchEventDetails();
  }, [providerGameId]);
  
  const toggleFight = useCallback((fightId: string) => {
    setExpandedFights(prev => {
      const next = new Set(prev);
      if (next.has(fightId)) {
        next.delete(fightId);
      } else {
        next.add(fightId);
      }
      return next;
    });
  }, []);
  
  // Separate main event from other fights
  const mainEvent = fights.find(f => f.order === 1);
  const mainCardFights = fights.filter(f => 
    f.order !== 1 && f.cardSegment?.toLowerCase().includes('main')
  );
  const prelimsFights = fights.filter(f => 
    f.cardSegment?.toLowerCase().includes('prelim') && 
    !f.cardSegment?.toLowerCase().includes('early')
  );
  const earlyPrelimsFights = fights.filter(f => 
    f.cardSegment?.toLowerCase().includes('early')
  );
  // Catch any ungrouped fights
  const otherFights = fights.filter(f => 
    f.order !== 1 &&
    !f.cardSegment?.toLowerCase().includes('main') &&
    !f.cardSegment?.toLowerCase().includes('prelim')
  );
  
  // Format event date
  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  const formatEventTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };
  
  return (
    <div className="min-h-screen pb-24">
      <CinematicBackground />
      
      <div className="relative z-10">
        {/* Back Button */}
        <div className="px-4 pt-4">
          <button
            onClick={() => navigate('/games')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back to Games</span>
          </button>
        </div>
        
        <div className="px-4 pt-4 max-w-2xl mx-auto space-y-4">
          {/* Event Header */}
          <GlassCard className="overflow-hidden">
            {/* UFC Banner */}
            <div className="relative px-4 py-4 bg-gradient-to-r from-red-600/30 via-red-500/10 to-red-600/30 border-b border-red-500/20">
              <div className="flex items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                  <span className="text-white font-black text-lg tracking-tighter">UFC</span>
                </div>
              </div>
            </div>
            
            <div className="p-5">
              {loading ? (
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
                  <span className="text-white/50">Loading fight card...</span>
                </div>
              ) : (
                <>
                  {/* Event Name */}
                  <h1 className="text-2xl font-bold text-white text-center mb-4">
                    {event?.name || 'UFC Event'}
                  </h1>
                  
                  {/* Event Details */}
                  <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                    {event?.dateTime && (
                      <div className="flex items-center gap-2 text-white/60">
                        <Calendar className="w-4 h-4" />
                        <span>{formatEventDate(event.dateTime)}</span>
                      </div>
                    )}
                    
                    {event?.dateTime && (
                      <div className="flex items-center gap-2 text-white/60">
                        <Clock className="w-4 h-4" />
                        <span>{formatEventTime(event.dateTime)}</span>
                      </div>
                    )}
                    
                    {(event?.venue || event?.city) && (
                      <div className="flex items-center gap-2 text-white/60">
                        <MapPin className="w-4 h-4" />
                        <span>
                          {[event.venue, event.city, event.state].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Status Badge */}
                  {event?.status && (
                    <div className="flex justify-center mt-4">
                      <Badge className={cn(
                        "text-sm",
                        event.status.toLowerCase() === 'final'
                          ? "bg-slate-500/20 text-slate-400"
                          : event.status.toLowerCase().includes('live') || event.status.toLowerCase() === 'in_progress'
                            ? "bg-red-500/20 text-red-400"
                            : "bg-emerald-500/20 text-emerald-400"
                      )}>
                        {event.status.toLowerCase().includes('live') || event.status.toLowerCase() === 'in_progress' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse mr-2" />
                            LIVE
                          </>
                        ) : (
                          event.status
                        )}
                      </Badge>
                    </div>
                  )}
                </>
              )}
            </div>
          </GlassCard>
          
          {/* Error State */}
          {error && fights.length === 0 && !loading && (
            <GlassCard className="p-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-white/50 mb-2">Fight card not available</p>
                <p className="text-white/30 text-sm">{error}</p>
              </div>
            </GlassCard>
          )}
          
          {/* Main Event */}
          {mainEvent && (
            <MainEventCard 
              fight={mainEvent} 
              odds={odds.find(o => o.fightId === mainEvent.fightId)}
            />
          )}
          
          {/* Main Card */}
          {mainCardFights.length > 0 && (
            <div>
              <SegmentHeader title="Main Card" count={mainCardFights.length} variant="main" />
              <div className="space-y-2">
                {mainCardFights.map(fight => (
                  <FightCard
                    key={fight.fightId}
                    fight={fight}
                    odds={odds.find(o => o.fightId === fight.fightId)}
                    isExpanded={expandedFights.has(fight.fightId)}
                    onToggle={() => toggleFight(fight.fightId)}
                    isMainCard={true}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Prelims */}
          {prelimsFights.length > 0 && (
            <div>
              <SegmentHeader title="Prelims" count={prelimsFights.length} variant="prelims" />
              <div className="space-y-2">
                {prelimsFights.map(fight => (
                  <FightCard
                    key={fight.fightId}
                    fight={fight}
                    odds={odds.find(o => o.fightId === fight.fightId)}
                    isExpanded={expandedFights.has(fight.fightId)}
                    onToggle={() => toggleFight(fight.fightId)}
                    isMainCard={false}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Early Prelims */}
          {earlyPrelimsFights.length > 0 && (
            <div>
              <SegmentHeader title="Early Prelims" count={earlyPrelimsFights.length} variant="prelims" />
              <div className="space-y-2">
                {earlyPrelimsFights.map(fight => (
                  <FightCard
                    key={fight.fightId}
                    fight={fight}
                    odds={odds.find(o => o.fightId === fight.fightId)}
                    isExpanded={expandedFights.has(fight.fightId)}
                    onToggle={() => toggleFight(fight.fightId)}
                    isMainCard={false}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Other/Ungrouped Fights */}
          {otherFights.length > 0 && (
            <div>
              <SegmentHeader title="Fights" count={otherFights.length} variant="prelims" />
              <div className="space-y-2">
                {otherFights.map(fight => (
                  <FightCard
                    key={fight.fightId}
                    fight={fight}
                    odds={odds.find(o => o.fightId === fight.fightId)}
                    isExpanded={expandedFights.has(fight.fightId)}
                    onToggle={() => toggleFight(fight.fightId)}
                    isMainCard={false}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Empty State */}
          {fights.length === 0 && !error && !loading && (
            <GlassCard className="p-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-white/50">Fight card not yet announced</p>
                <p className="text-white/30 text-sm mt-1">Check back closer to the event</p>
              </div>
            </GlassCard>
          )}
          
          {/* Stats Footer */}
          {fights.length > 0 && (
            <GlassCard className="p-4">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-white">{fights.length}</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Total Fights</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-400">
                    {(mainEvent ? 1 : 0) + mainCardFights.length}
                  </div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Main Card</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">
                    {prelimsFights.length + earlyPrelimsFights.length}
                  </div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Prelims</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {odds.filter(o => o.sportsbooks.length > 0).length}
                  </div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">With Odds</div>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}

export default MMAEventDetail;
