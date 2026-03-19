/**
 * Line Movement Alerts Component
 * Displays sharp action alerts for odds movements
 */

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Flame, Zap, Clock, ChevronRight, Bell, X } from 'lucide-react';
import { useDemoAuth } from '../contexts/DemoAuthContext';
import { useDataHubAlerts } from '../hooks/useDataHub';

interface LineMovement {
  id: string;
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  type: 'spread' | 'total' | 'moneyline';
  direction: 'up' | 'down';
  previousValue: number;
  currentValue: number;
  change: number;
  severity: 'minor' | 'moderate' | 'sharp' | 'steam';
  detectedAt: string;
  source: string;
  analysis: string;
}

interface SharpAlert {
  id: string;
  movement: LineMovement;
  headline: string;
  description: string;
  isNew: boolean;
  expiresAt: string;
}

interface LineMovementAlertsProps {
  sport?: string;
  compact?: boolean;
  maxAlerts?: number;
  onAlertClick?: (alert: SharpAlert) => void;
}

// Severity badge colors and styling
const SEVERITY_CONFIG = {
  steam: {
    bg: 'bg-gradient-to-r from-orange-600 to-red-600',
    text: 'text-white',
    icon: Flame,
    label: 'STEAM',
    glow: 'shadow-lg shadow-orange-500/30',
  },
  sharp: {
    bg: 'bg-gradient-to-r from-yellow-500 to-amber-600',
    text: 'text-black',
    icon: Zap,
    label: 'SHARP',
    glow: 'shadow-lg shadow-yellow-500/30',
  },
  moderate: {
    bg: 'bg-blue-600/80',
    text: 'text-white',
    icon: TrendingUp,
    label: 'NOTABLE',
    glow: '',
  },
  minor: {
    bg: 'bg-gray-600/80',
    text: 'text-gray-200',
    icon: TrendingUp,
    label: 'MINOR',
    glow: '',
  },
};

// Movement type labels
const TYPE_LABELS = {
  spread: 'Spread',
  total: 'Total',
  moneyline: 'ML',
};

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.floor((now - then) / 1000);
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatValue(type: string, value: number): string {
  if (type === 'spread') {
    return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  }
  if (type === 'total') {
    return value.toFixed(1);
  }
  if (type === 'moneyline') {
    return value >= 0 ? `+${value}` : `${value}`;
  }
  return String(value);
}

// Single alert card component
function AlertCard({ 
  alert, 
  compact, 
  onDismiss,
  onClick,
}: { 
  alert: SharpAlert; 
  compact?: boolean;
  onDismiss?: () => void;
  onClick?: () => void;
}) {
  const { movement } = alert;
  const config = SEVERITY_CONFIG[movement.severity];
  const Icon = config.icon;
  const DirectionIcon = movement.direction === 'up' ? TrendingUp : TrendingDown;
  
  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:bg-slate-700/60 transition-all ${config.glow}`}
      >
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${config.bg} ${config.text}`}>
          {config.label}
        </span>
        <span className="text-sm text-white font-medium truncate max-w-[180px]">
          {movement.homeTeam} vs {movement.awayTeam}
        </span>
        <span className="text-xs text-gray-400">
          {TYPE_LABELS[movement.type]}
        </span>
        <DirectionIcon className={`w-4 h-4 ${movement.direction === 'up' ? 'text-green-400' : 'text-red-400'}`} />
      </button>
    );
  }
  
  return (
    <div 
      className={`relative group bg-slate-800/80 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-700/60 transition-all ${config.glow} ${alert.isNew ? 'ring-2 ring-yellow-500/50' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-full bg-slate-600/50 hover:bg-slate-500/50 transition-all"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      )}
      
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1 ${config.bg} ${config.text}`}>
            <Icon className="w-3 h-3" />
            {config.label}
          </span>
          <span className="text-xs text-gray-500 bg-slate-700/50 px-2 py-1 rounded">
            {movement.sport}
          </span>
          {alert.isNew && (
            <span className="text-xs text-yellow-400 bg-yellow-500/20 px-2 py-1 rounded font-medium">
              NEW
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          {formatTimeAgo(movement.detectedAt)}
        </div>
      </div>
      
      {/* Matchup */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-white font-semibold">{movement.homeTeam}</span>
        <span className="text-gray-500">vs</span>
        <span className="text-white font-semibold">{movement.awayTeam}</span>
      </div>
      
      {/* Movement details */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-400 uppercase">{TYPE_LABELS[movement.type]}</span>
          <span className="text-gray-500">{formatValue(movement.type, movement.previousValue)}</span>
          <DirectionIcon className={`w-4 h-4 ${movement.direction === 'up' ? 'text-green-400' : 'text-red-400'}`} />
          <span className={`font-bold ${movement.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
            {formatValue(movement.type, movement.currentValue)}
          </span>
        </div>
        <div className={`text-sm font-medium ${movement.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
          {movement.change > 0 ? '+' : ''}{movement.type === 'moneyline' ? Math.round(movement.change) : movement.change.toFixed(1)}
        </div>
      </div>
      
      {/* Analysis */}
      <p className="text-sm text-gray-400 leading-relaxed">
        {movement.analysis}
      </p>
      
      {/* Action */}
      {onClick && (
        <div className="flex items-center justify-end mt-3 text-xs text-blue-400">
          View Game <ChevronRight className="w-3 h-3 ml-1" />
        </div>
      )}
    </div>
  );
}

// Main component
export function LineMovementAlerts({
  sport,
  compact = false,
  maxAlerts = 10,
  onAlertClick,
}: LineMovementAlertsProps) {
  const { isDemoMode, isPending } = useDemoAuth();
  const [alerts, setAlerts] = useState<SharpAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Wait for context to initialize before fetching
    if (isPending) return;
    
    async function doFetch() {
      try {
        const url = sport 
          ? `/api/line-movement/alerts?sport=${sport}`
          : '/api/line-movement/alerts';
        
        const res = await fetch(url, {
          headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
        });
        
        if (!res.ok) throw new Error('Failed to fetch alerts');
        
        const data = await res.json();
        setAlerts(data.alerts?.slice(0, maxAlerts) || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching line movement alerts:', err);
        setError('Failed to load alerts');
      } finally {
        setLoading(false);
      }
    }
    
    doFetch();
    // Refresh every 30 seconds
    const interval = setInterval(doFetch, 30000);
    return () => clearInterval(interval);
  }, [sport, isDemoMode, isPending, maxAlerts]);
  
function handleDismiss(alertId: string) {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    // Optionally mark as read on backend
    fetch(`/api/line-movement/alerts/${alertId}/read`, {
      method: 'POST',
      headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
    }).catch(console.error);
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-center py-6 text-red-400">
        <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }
  
  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No Line Movements</p>
        <p className="text-xs mt-1">Sharp action alerts will appear here</p>
      </div>
    );
  }
  
  // Compact horizontal scroll view
  if (compact) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {alerts.map(alert => (
          <AlertCard
            key={alert.id}
            alert={alert}
            compact
            onClick={() => onAlertClick?.(alert)}
          />
        ))}
      </div>
    );
  }
  
  // Full card view
  return (
    <div className="space-y-3">
      {alerts.map(alert => (
        <AlertCard
          key={alert.id}
          alert={alert}
          onDismiss={() => handleDismiss(alert.id)}
          onClick={() => onAlertClick?.(alert)}
        />
      ))}
    </div>
  );
}

// Stats summary component
export function LineMovementStats() {
  const { isDemoMode } = useDemoAuth();
  const [stats, setStats] = useState<{
    totalAlerts: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    bySport: Record<string, number>;
  } | null>(null);
  
  useEffect(() => {
    fetch('/api/line-movement/stats', {
      headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
    })
      .then(res => res.json())
      .then(data => setStats(data.stats))
      .catch(console.error);
  }, [isDemoMode]);
  
  if (!stats || stats.totalAlerts === 0) return null;
  
  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-2">
        <Flame className="w-4 h-4 text-orange-500" />
        <span className="text-gray-400">
          {stats.bySeverity.steam || 0} steam
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-500" />
        <span className="text-gray-400">
          {stats.bySeverity.sharp || 0} sharp
        </span>
      </div>
      <div className="text-gray-600">|</div>
      <span className="text-gray-500">
        {stats.totalAlerts} total movements
      </span>
    </div>
  );
}

// Compact alert strip for dashboard
export function LineMovementStrip({ sport }: { sport?: string }) {
  const { isDemoMode, isPending } = useDemoAuth();
  const [alerts, setAlerts] = useState<SharpAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Wait for context to initialize before fetching
    if (isPending) return;
    
    const url = sport 
      ? `/api/line-movement/alerts?sport=${sport}`
      : '/api/line-movement/alerts';
    
    fetch(url, {
      headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
    })
      .then(res => res.json())
      .then(data => {
        setAlerts(data.alerts?.slice(0, 5) || []);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [sport, isDemoMode, isPending]);
  
  // Show nothing while loading or if no alerts
  if (isLoading || alerts.length === 0) return null;
  
  const steamCount = alerts.filter(a => a.movement.severity === 'steam').length;
  const sharpCount = alerts.filter(a => a.movement.severity === 'sharp').length;
  
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-700/50 rounded-lg">
      <div className="flex items-center gap-1">
        <Zap className="w-4 h-4 text-yellow-500" />
        <span className="text-sm font-medium text-white">Sharp Action</span>
      </div>
      
      <div className="h-4 w-px bg-slate-700" />
      
      {steamCount > 0 && (
        <div className="flex items-center gap-1 text-xs">
          <Flame className="w-3 h-3 text-orange-500" />
          <span className="text-orange-400 font-medium">{steamCount} steam</span>
        </div>
      )}
      
      {sharpCount > 0 && (
        <div className="flex items-center gap-1 text-xs">
          <Zap className="w-3 h-3 text-yellow-500" />
          <span className="text-yellow-400 font-medium">{sharpCount} sharp</span>
        </div>
      )}
      
      <div className="flex-1" />
      
      <span className="text-xs text-gray-500">
        {alerts.length} movement{alerts.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

/**
 * LineMovementStripHub - Version that uses consolidated DataHub polling
 * No internal polling - data comes from parent DataHubProvider
 */
export function LineMovementStripHub() {
  const { alerts, loading, steamCount, sharpCount } = useDataHubAlerts();
  
  // Show nothing while loading or if no alerts
  if (loading || alerts.length === 0) return null;
  
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-700/50 rounded-lg">
      <div className="flex items-center gap-1">
        <Zap className="w-4 h-4 text-yellow-500" />
        <span className="text-sm font-medium text-white">Sharp Action</span>
      </div>
      
      <div className="h-4 w-px bg-slate-700" />
      
      {steamCount > 0 && (
        <div className="flex items-center gap-1 text-xs">
          <Flame className="w-3 h-3 text-orange-500" />
          <span className="text-orange-400 font-medium">{steamCount} steam</span>
        </div>
      )}
      
      {sharpCount > 0 && (
        <div className="flex items-center gap-1 text-xs">
          <Zap className="w-3 h-3 text-yellow-500" />
          <span className="text-yellow-400 font-medium">{sharpCount} sharp</span>
        </div>
      )}
      
      <div className="flex-1" />
      
      <span className="text-xs text-gray-500">
        {alerts.length} movement{alerts.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

export default LineMovementAlerts;
