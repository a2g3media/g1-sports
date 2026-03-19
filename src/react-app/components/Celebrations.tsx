/**
 * Animated Victory and Elimination Celebrations
 * 
 * Visual effects that trigger when player statuses change in Live Sweat view.
 */

import { useEffect, useState, useCallback } from 'react';
import { Trophy, Skull, X, Sparkles, Star } from 'lucide-react';

// Types
export type CelebrationType = 'VICTORY' | 'ELIMINATION';

export interface CelebrationEvent {
  id: string;
  type: CelebrationType;
  playerName: string;
  teamName?: string;
  timestamp: number;
}

// Confetti particle component
function ConfettiParticle({ 
  color 
}: { 
  color: string;
}) {
  const randomX = Math.random() * 100;
  const randomDelay = Math.random() * 0.5;
  const randomDuration = 1.5 + Math.random() * 1;
  const randomRotation = Math.random() * 720 - 360;
  const randomSize = 6 + Math.random() * 8;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${randomX}%`,
        top: '-20px',
        width: `${randomSize}px`,
        height: `${randomSize}px`,
        backgroundColor: color,
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        animation: `confetti-fall ${randomDuration}s ease-out ${randomDelay}s forwards`,
        transform: `rotate(${randomRotation}deg)`,
      }}
    />
  );
}

// Victory celebration with confetti
export function VictoryCelebration({ 
  playerName, 
  onComplete 
}: { 
  playerName: string; 
  onComplete: () => void;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const colors = ['#22c55e', '#4ade80', '#86efac', '#fbbf24', '#f59e0b', '#ffffff'];

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 300);
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 pointer-events-none overflow-hidden transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Confetti particles */}
      {Array.from({ length: 50 }).map((_, i) => (
        <ConfettiParticle 
          key={i} 
          color={colors[i % colors.length]} 
        />
      ))}

      {/* Central celebration card */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="bg-gradient-to-br from-green-600 via-emerald-500 to-green-400 rounded-2xl p-8 shadow-2xl shadow-green-500/30 animate-in zoom-in-50 duration-500"
          style={{ animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          <div className="flex flex-col items-center gap-4">
            {/* Trophy with glow */}
            <div className="relative">
              <div className="absolute inset-0 blur-xl bg-yellow-400/50 rounded-full scale-150" />
              <div className="relative bg-gradient-to-br from-yellow-300 to-amber-500 p-4 rounded-full">
                <Trophy className="w-12 h-12 text-yellow-900" />
              </div>
              {/* Sparkles */}
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-300 animate-pulse" />
              <Star className="absolute -bottom-1 -left-2 w-5 h-5 text-yellow-200 animate-pulse" style={{ animationDelay: '0.2s' }} />
            </div>

            {/* Text */}
            <div className="text-center">
              <div className="text-white/80 text-sm font-medium uppercase tracking-wider mb-1">
                Victory!
              </div>
              <div className="text-white text-xl font-bold">
                {playerName}
              </div>
              <div className="text-green-100/80 text-sm mt-1">
                is SAFE! 🎉
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Elimination effect with dramatic red fade
export function EliminationCelebration({ 
  playerName, 
  onComplete 
}: { 
  playerName: string; 
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<'flash' | 'show' | 'fade'>('flash');

  useEffect(() => {
    // Flash phase
    const flashTimer = setTimeout(() => setPhase('show'), 200);
    // Fade phase
    const showTimer = setTimeout(() => setPhase('fade'), 2500);
    // Complete
    const completeTimer = setTimeout(onComplete, 3000);

    return () => {
      clearTimeout(flashTimer);
      clearTimeout(showTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Red flash overlay */}
      <div 
        className={`absolute inset-0 transition-opacity duration-200 ${
          phase === 'flash' ? 'opacity-40' : 'opacity-0'
        }`}
        style={{ backgroundColor: '#dc2626' }}
      />

      {/* Vignette effect */}
      <div 
        className={`absolute inset-0 transition-opacity duration-500 ${
          phase === 'fade' ? 'opacity-0' : 'opacity-100'
        }`}
        style={{
          background: 'radial-gradient(circle at center, transparent 30%, rgba(127, 29, 29, 0.4) 100%)',
        }}
      />

      {/* Central elimination card */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className={`transition-all duration-500 ${
            phase === 'flash' ? 'scale-150 opacity-0' :
            phase === 'show' ? 'scale-100 opacity-100' :
            'scale-95 opacity-0'
          }`}
        >
          <div className="bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 rounded-2xl p-8 shadow-2xl border border-red-500/30">
            <div className="flex flex-col items-center gap-4">
              {/* Skull icon with red glow */}
              <div className="relative">
                <div className="absolute inset-0 blur-lg bg-red-600/50 rounded-full scale-150" />
                <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 p-4 rounded-full border-2 border-red-500/50">
                  <Skull className="w-12 h-12 text-red-500" />
                </div>
                {/* X marks */}
                <X className="absolute -top-1 -right-1 w-5 h-5 text-red-400" />
                <X className="absolute -bottom-1 -left-1 w-5 h-5 text-red-400" />
              </div>

              {/* Text */}
              <div className="text-center">
                <div className="text-red-400 text-sm font-medium uppercase tracking-wider mb-1">
                  Eliminated
                </div>
                <div className="text-white text-xl font-bold line-through decoration-red-500 decoration-2">
                  {playerName}
                </div>
                <div className="text-gray-400 text-sm mt-1">
                  is OUT of the pool
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Falling X particles */}
      {phase === 'show' && Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute text-red-500/60 pointer-events-none"
          style={{
            left: `${10 + Math.random() * 80}%`,
            top: '-20px',
            animation: `fall-x ${2 + Math.random()}s ease-in ${Math.random() * 0.5}s forwards`,
            fontSize: `${16 + Math.random() * 16}px`,
          }}
        >
          ✕
        </div>
      ))}
    </div>
  );
}

// Manager component to handle celebration queue
export function CelebrationManager({ 
  events, 
  onEventComplete 
}: { 
  events: CelebrationEvent[];
  onEventComplete: (id: string) => void;
}) {
  // Only show one celebration at a time (the first in queue)
  const currentEvent = events[0];

  const handleComplete = useCallback(() => {
    if (currentEvent) {
      onEventComplete(currentEvent.id);
    }
  }, [currentEvent, onEventComplete]);

  if (!currentEvent) return null;

  if (currentEvent.type === 'VICTORY') {
    return (
      <VictoryCelebration 
        playerName={currentEvent.playerName} 
        onComplete={handleComplete}
      />
    );
  }

  if (currentEvent.type === 'ELIMINATION') {
    return (
      <EliminationCelebration 
        playerName={currentEvent.playerName} 
        onComplete={handleComplete}
      />
    );
  }

  return null;
}

// Mini celebration badges that appear inline
export function MiniVictoryBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-400 text-white text-[10px] font-bold animate-in zoom-in-50 duration-300">
      <Trophy className="w-3 h-3" />
      SAFE!
    </span>
  );
}

export function MiniEliminationBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 text-red-400 text-[10px] font-bold animate-in zoom-in-50 duration-300 border border-red-500/30">
      <Skull className="w-3 h-3" />
      OUT
    </span>
  );
}

// CSS keyframes (add to index.css or inline)
export const celebrationStyles = `
@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}

@keyframes fall-x {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 0.6;
  }
  100% {
    transform: translateY(100vh) rotate(360deg);
    opacity: 0;
  }
}
`;
