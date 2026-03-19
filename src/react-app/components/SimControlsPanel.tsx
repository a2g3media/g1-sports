/**
 * Simulation Controls Panel
 * 
 * Provides manual controls for the Live Sweat demo simulator.
 * Only visible when Demo Live Mode is enabled.
 */

import { 
  Play, 
  Pause, 
  FastForward, 
  Zap, 
  ArrowLeftRight, 
  Flag,
  RotateCcw,
  FlaskConical
} from 'lucide-react';
import type { LiveSweatSimulator } from '@/react-app/hooks/useLiveSweatSimulator';

interface SimControlsPanelProps {
  simulator: LiveSweatSimulator;
}

export function SimControlsPanel({ simulator }: SimControlsPanelProps) {
  const {
    tickCount,
    isAutoRunning,
    tick,
    forceUpset,
    flipLead,
    finalizeGame,
    toggleAutoRun,
    reset,
  } = simulator;

  return (
    <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/30 rounded-xl p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-purple-400" />
          <span className="text-sm font-bold text-purple-300 uppercase tracking-wider">
            Demo Simulation Mode
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-purple-400/70">Tick #{tickCount}</span>
          <button
            onClick={reset}
            className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 transition-colors"
            title="Reset simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {/* Tick Button */}
        <button
          onClick={tick}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white transition-colors"
        >
          <FastForward className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium">Tick +20s</span>
        </button>

        {/* Auto-Run Toggle */}
        <button
          onClick={() => toggleAutoRun(!isAutoRunning)}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
            isAutoRunning 
              ? 'bg-green-600/20 border-green-500/50 text-green-400 hover:bg-green-600/30' 
              : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
          }`}
        >
          {isAutoRunning ? (
            <>
              <Pause className="w-4 h-4" />
              <span className="text-sm font-medium">Stop</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium">Auto-Run</span>
            </>
          )}
        </button>

        {/* Force Upset */}
        <button
          onClick={forceUpset}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-400 transition-colors"
        >
          <Zap className="w-4 h-4" />
          <span className="text-sm font-medium">Force Upset</span>
        </button>

        {/* Flip Lead */}
        <button
          onClick={flipLead}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 text-yellow-400 transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span className="text-sm font-medium">Flip Lead</span>
        </button>

        {/* Finalize Game */}
        <button
          onClick={() => finalizeGame()}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/30 text-gray-300 transition-colors"
        >
          <Flag className="w-4 h-4" />
          <span className="text-sm font-medium">Finalize</span>
        </button>
      </div>

      {/* Info Text */}
      <p className="mt-3 text-xs text-purple-400/60 text-center">
        Using simulated data • No real games affected • Alerts and counters update as if live
      </p>
    </div>
  );
}
