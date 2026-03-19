import { useCallback, useEffect, useRef, useState } from 'react';

// Sound types for different play events
export type SoundType = 'highlight' | 'score' | 'bigPlay' | 'notification' | 'betCovering' | 'betNotCovering' | 'betWon' | 'betLost' | 'statUpdate' | 'propHit' | 'propBehind';

// Persistent mute state key
const MUTE_KEY = 'gz-sports-sound-muted';
const HAPTIC_KEY = 'gz-sports-haptic-enabled';

// Haptic patterns for different events (vibration in ms)
// Pattern format: [vibrate, pause, vibrate, pause, ...]
const HAPTIC_PATTERNS: Record<SoundType, number | number[]> = {
  highlight: [40, 30, 60],           // Quick ascending feel
  score: 30,                          // Simple tap
  bigPlay: [60, 40, 80],             // Deeper pulse
  notification: 15,                   // Subtle tick
  betCovering: [40, 30, 60, 30, 80], // Positive build
  betNotCovering: [60, 40, 40],      // Descending feel
  betWon: [50, 40, 70, 40, 100],     // Triumphant
  betLost: [80, 60, 50],             // Low fade
  statUpdate: [35, 25, 35, 25, 45],  // Quick triple-tap
  propHit: [50, 40, 70, 40, 100, 40, 130], // Celebratory fanfare
  propBehind: [70, 50, 70, 50, 70, 50, 70], // Urgent quad-pulse
};

// Get stored mute preference
function getStoredMuteState(): boolean {
  try {
    const stored = localStorage.getItem(MUTE_KEY);
    // Default to NOT muted (sounds ON)
    return stored === 'true';
  } catch {
    return false;
  }
}

// Store mute preference
function setStoredMuteState(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // Ignore storage errors
  }
}

// Get stored haptic preference
function getStoredHapticState(): boolean {
  try {
    const stored = localStorage.getItem(HAPTIC_KEY);
    // Default to enabled on mobile devices
    return stored !== 'false';
  } catch {
    return true;
  }
}

// Store haptic preference
function setStoredHapticState(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTIC_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

// Check if device supports vibration
function supportsVibration(): boolean {
  return 'vibrate' in navigator;
}

/**
 * useSoundEffects hook
 * 
 * Provides synthesized sound effects for game events using Web Audio API.
 * Sounds are subtle and professional - think notification chimes, not arcade sounds.
 * Mute state persists across sessions.
 */
export function useSoundEffects() {
  const [isMuted, setIsMuted] = useState(getStoredMuteState);
  const [isHapticEnabled, setIsHapticEnabled] = useState(getStoredHapticState);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Initialize AudioContext on first user interaction
  const getAudioContext = useCallback((): AudioContext | null => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        console.warn('Web Audio API not supported');
        return null;
      }
    }
    
    // Resume if suspended (browsers require user interaction)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    return audioContextRef.current;
  }, []);
  
  // Toggle mute state
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newState = !prev;
      setStoredMuteState(newState);
      return newState;
    });
  }, []);
  
  // Toggle haptic feedback
  const toggleHaptic = useCallback(() => {
    setIsHapticEnabled(prev => {
      const newState = !prev;
      setStoredHapticState(newState);
      return newState;
    });
  }, []);
  
  // Trigger haptic feedback for a sound type
  const triggerHaptic = useCallback((type: SoundType) => {
    if (!isHapticEnabled || !supportsVibration()) return;
    
    try {
      const pattern = HAPTIC_PATTERNS[type];
      navigator.vibrate(pattern);
    } catch {
      // Vibration may fail silently on some devices
    }
  }, [isHapticEnabled]);
  
  // Play a subtle synthesized sound
  const playSound = useCallback((type: SoundType) => {
    // Trigger haptic feedback alongside sound
    triggerHaptic(type);
    
    if (isMuted) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    
    // Create oscillator for tone
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Configure sound based on type
    switch (type) {
      case 'highlight':
        // Two-tone chime (ascending) - for 3PT, dunks, blocks
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, now); // C5
        oscillator.frequency.setValueAtTime(659.25, now + 0.08); // E5
        oscillator.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.12, now + 0.02);
        gainNode.gain.setValueAtTime(0.12, now + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        oscillator.start(now);
        oscillator.stop(now + 0.5);
        break;
        
      case 'score':
        // Simple soft pop - for regular scores
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, now); // A5
        oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.1);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.08, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
        break;
        
      case 'bigPlay':
        // Deeper resonant tone - for lead changes, momentum shifts
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(329.63, now); // E4
        oscillator.frequency.setValueAtTime(392, now + 0.1); // G4
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.1, now + 0.02);
        gainNode.gain.setValueAtTime(0.1, now + 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
        break;
        
      case 'notification':
        // Very subtle tick - for general events
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.05, now + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
        break;
        
      case 'betCovering':
        // Positive ascending chime - leg is now covering
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, now); // C5
        oscillator.frequency.setValueAtTime(659.25, now + 0.1); // E5
        oscillator.frequency.setValueAtTime(783.99, now + 0.2); // G5
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.15, now + 0.03);
        gainNode.gain.setValueAtTime(0.12, now + 0.25);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        oscillator.start(now);
        oscillator.stop(now + 0.6);
        break;
        
      case 'betNotCovering':
        // Descending tone - leg dropped out of coverage
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(659.25, now); // E5
        oscillator.frequency.setValueAtTime(493.88, now + 0.12); // B4
        oscillator.frequency.setValueAtTime(392, now + 0.24); // G4
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.12, now + 0.03);
        gainNode.gain.setValueAtTime(0.1, now + 0.28);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        oscillator.start(now);
        oscillator.stop(now + 0.5);
        break;
        
      case 'betWon':
        // Triumphant fanfare - leg won!
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, now); // C5
        oscillator.frequency.setValueAtTime(659.25, now + 0.08); // E5
        oscillator.frequency.setValueAtTime(783.99, now + 0.16); // G5
        oscillator.frequency.setValueAtTime(1046.5, now + 0.24); // C6
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.18, now + 0.03);
        gainNode.gain.setValueAtTime(0.15, now + 0.32);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        oscillator.start(now);
        oscillator.stop(now + 0.7);
        break;
        
      case 'betLost':
        // Low descending tone - leg lost
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(329.63, now); // E4
        oscillator.frequency.exponentialRampToValueAtTime(196, now + 0.3); // G3
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.1, now + 0.03);
        gainNode.gain.setValueAtTime(0.08, now + 0.25);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        oscillator.start(now);
        oscillator.stop(now + 0.5);
        break;
        
      case 'statUpdate':
        // Bright double-ping - player stat increased (assist, rebound, etc.)
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1046.50, now); // C6
        oscillator.frequency.setValueAtTime(1318.51, now + 0.08); // E6
        oscillator.frequency.setValueAtTime(1567.98, now + 0.16); // G6
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.12, now + 0.01);
        gainNode.gain.setValueAtTime(0.08, now + 0.12);
        gainNode.gain.linearRampToValueAtTime(0.1, now + 0.18);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        oscillator.start(now);
        oscillator.stop(now + 0.35);
        break;
        
      case 'propHit':
        // Triumphant ascending fanfare - prop target reached!
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, now); // C5
        oscillator.frequency.setValueAtTime(659.25, now + 0.08); // E5
        oscillator.frequency.setValueAtTime(783.99, now + 0.16); // G5
        oscillator.frequency.setValueAtTime(1046.50, now + 0.24); // C6
        oscillator.frequency.setValueAtTime(1318.51, now + 0.35); // E6
        oscillator.frequency.setValueAtTime(1567.98, now + 0.45); // G6
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.12, now + 0.02);
        gainNode.gain.setValueAtTime(0.14, now + 0.25);
        gainNode.gain.linearRampToValueAtTime(0.16, now + 0.36);
        gainNode.gain.setValueAtTime(0.14, now + 0.55);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        oscillator.start(now);
        oscillator.stop(now + 0.85);
        break;
        
      case 'propBehind':
        // Urgent double-warning tone - prop falling behind target
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(493.88, now); // B4
        oscillator.frequency.setValueAtTime(392, now + 0.08); // G4
        oscillator.frequency.setValueAtTime(329.63, now + 0.16); // E4
        oscillator.frequency.setValueAtTime(493.88, now + 0.28); // B4 (repeat)
        oscillator.frequency.setValueAtTime(349.23, now + 0.36); // F4
        oscillator.frequency.setValueAtTime(293.66, now + 0.44); // D4
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.09, now + 0.02);
        gainNode.gain.setValueAtTime(0.05, now + 0.22);
        gainNode.gain.linearRampToValueAtTime(0.08, now + 0.3);
        gainNode.gain.setValueAtTime(0.06, now + 0.48);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        oscillator.start(now);
        oscillator.stop(now + 0.6);
        break;
    }
  }, [isMuted, triggerHaptic, getAudioContext]);
  
  // Determine sound type based on play description
  const playSoundForPlay = useCallback((play: {
    description?: string;
    isMajor?: boolean;
    points?: number;
  }) => {
    const desc = play.description?.toLowerCase() || '';
    
    // Highlight sounds for spectacular plays
    if (desc.includes('3pt') || desc.includes('three') || desc.includes('3-pointer') ||
        desc.includes('dunk') || desc.includes('slam') ||
        desc.includes('block')) {
      playSound('highlight');
      return;
    }
    
    // Big play sound for steals, lead changes
    if (desc.includes('steal') || play.isMajor) {
      playSound('bigPlay');
      return;
    }
    
    // Score sound for other scoring plays
    if ((play.points || 0) >= 2) {
      playSound('score');
      return;
    }
  }, [playSound]);
  
  // Clean up audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  return {
    isMuted,
    toggleMute,
    isHapticEnabled,
    toggleHaptic,
    triggerHaptic,
    playSound,
    playSoundForPlay,
  };
}
