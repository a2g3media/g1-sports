import { useState, useCallback, useEffect } from "react";

const STORAGE_KEYS = {
  HAS_COMPLETED_ONBOARDING: "gz_first_session_onboarding_complete",
  HAS_SEEN_SHARE_HINT: "gz_first_session_share_hint_seen",
  HAS_SEEN_LEADERBOARD_HINT: "gz_first_session_leaderboard_hint_seen",
  HAS_SEEN_COACH_G_WELCOME: "gz_first_session_coach_g_welcome_seen",
  FIRST_AI_INTERACTION_DONE: "gz_first_session_ai_done",
  FIRST_CORRECT_PICK_DONE: "gz_first_session_correct_pick_done",
  HAS_ASKED_FIRST_QUESTION: "gz_first_session_asked_question",
  HAS_RECEIVED_FIRST_RESPONSE: "gz_first_session_received_response",
  SESSION_START_TIME: "gz_first_session_start",
} as const;

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export interface FirstSessionState {
  isFirstSession: boolean;
  hasCompletedOnboarding: boolean;
  shouldShowShareHint: boolean;
  shouldShowLeaderboardHint: boolean;
  shouldShowCoachGWelcome: boolean;
  hasAskedFirstQuestion: boolean;
  hasReceivedFirstResponse: boolean;
  sessionDuration: number;
  
  // Actions
  completeOnboarding: () => void;
  markShareHintSeen: () => void;
  markLeaderboardHintSeen: () => void;
  markCoachGWelcomeSeen: () => void;
  markFirstAIInteraction: () => void;
  markFirstCorrectPick: () => void;
  recordQuestionAsked: () => void;
  recordResponseReceived: () => void;
}

export function useFirstSession(): FirstSessionState {
  const [state, setState] = useState(() => {
    const hasCompletedOnboarding = safeGetItem(STORAGE_KEYS.HAS_COMPLETED_ONBOARDING) === "true";
    const hasSeenShareHint = safeGetItem(STORAGE_KEYS.HAS_SEEN_SHARE_HINT) === "true";
    const hasSeenLeaderboardHint = safeGetItem(STORAGE_KEYS.HAS_SEEN_LEADERBOARD_HINT) === "true";
    const hasSeenCoachGWelcome = safeGetItem(STORAGE_KEYS.HAS_SEEN_COACH_G_WELCOME) === "true";
    const firstAIDone = safeGetItem(STORAGE_KEYS.FIRST_AI_INTERACTION_DONE) === "true";
    const firstCorrectPickDone = safeGetItem(STORAGE_KEYS.FIRST_CORRECT_PICK_DONE) === "true";
    const hasAskedFirstQuestion = safeGetItem(STORAGE_KEYS.HAS_ASKED_FIRST_QUESTION) === "true";
    const hasReceivedFirstResponse = safeGetItem(STORAGE_KEYS.HAS_RECEIVED_FIRST_RESPONSE) === "true";
    
    let sessionStart = safeGetItem(STORAGE_KEYS.SESSION_START_TIME);
    if (!sessionStart) {
      sessionStart = Date.now().toString();
      safeSetItem(STORAGE_KEYS.SESSION_START_TIME, sessionStart);
    }
    
    const isFirstSession = !hasCompletedOnboarding || 
      (Date.now() - parseInt(sessionStart)) < 5 * 60 * 1000;
    
    return {
      hasCompletedOnboarding,
      hasSeenShareHint,
      hasSeenLeaderboardHint,
      hasSeenCoachGWelcome,
      firstAIDone,
      firstCorrectPickDone,
      hasAskedFirstQuestion,
      hasReceivedFirstResponse,
      sessionStartTime: parseInt(sessionStart),
      isFirstSession,
    };
  });
  
  const [sessionDuration, setSessionDuration] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionDuration(Math.floor((Date.now() - state.sessionStartTime) / 1000));
    }, 10000);
    return () => clearInterval(interval);
  }, [state.sessionStartTime]);
  
  const completeOnboarding = useCallback(() => {
    safeSetItem(STORAGE_KEYS.HAS_COMPLETED_ONBOARDING, "true");
    setState(s => ({ ...s, hasCompletedOnboarding: true }));
  }, []);
  
  const markShareHintSeen = useCallback(() => {
    safeSetItem(STORAGE_KEYS.HAS_SEEN_SHARE_HINT, "true");
    setState(s => ({ ...s, hasSeenShareHint: true }));
  }, []);
  
  const markLeaderboardHintSeen = useCallback(() => {
    safeSetItem(STORAGE_KEYS.HAS_SEEN_LEADERBOARD_HINT, "true");
    setState(s => ({ ...s, hasSeenLeaderboardHint: true }));
  }, []);
  
  const markCoachGWelcomeSeen = useCallback(() => {
    safeSetItem(STORAGE_KEYS.HAS_SEEN_COACH_G_WELCOME, "true");
    setState(s => ({ ...s, hasSeenCoachGWelcome: true }));
  }, []);
  
  const markFirstAIInteraction = useCallback(() => {
    safeSetItem(STORAGE_KEYS.FIRST_AI_INTERACTION_DONE, "true");
    setState(s => ({ ...s, firstAIDone: true }));
  }, []);
  
  const markFirstCorrectPick = useCallback(() => {
    safeSetItem(STORAGE_KEYS.FIRST_CORRECT_PICK_DONE, "true");
    setState(s => ({ ...s, firstCorrectPickDone: true }));
  }, []);
  
  const recordQuestionAsked = useCallback(() => {
    safeSetItem(STORAGE_KEYS.HAS_ASKED_FIRST_QUESTION, "true");
    setState(s => ({ ...s, hasAskedFirstQuestion: true }));
  }, []);
  
  const recordResponseReceived = useCallback(() => {
    safeSetItem(STORAGE_KEYS.HAS_RECEIVED_FIRST_RESPONSE, "true");
    safeSetItem(STORAGE_KEYS.FIRST_AI_INTERACTION_DONE, "true");
    setState(s => ({ ...s, hasReceivedFirstResponse: true, firstAIDone: true }));
  }, []);
  
  const shouldShowShareHint = state.isFirstSession && 
    state.firstAIDone && 
    !state.hasSeenShareHint;
  
  const shouldShowLeaderboardHint = state.isFirstSession && 
    state.firstCorrectPickDone && 
    !state.hasSeenLeaderboardHint;
    
  const shouldShowCoachGWelcome = state.isFirstSession &&
    state.hasCompletedOnboarding &&
    !state.hasSeenCoachGWelcome &&
    !state.hasAskedFirstQuestion;
  
  return {
    isFirstSession: state.isFirstSession,
    hasCompletedOnboarding: state.hasCompletedOnboarding,
    shouldShowShareHint,
    shouldShowLeaderboardHint,
    shouldShowCoachGWelcome,
    hasAskedFirstQuestion: state.hasAskedFirstQuestion,
    hasReceivedFirstResponse: state.hasReceivedFirstResponse,
    sessionDuration,
    completeOnboarding,
    markShareHintSeen,
    markLeaderboardHintSeen,
    markCoachGWelcomeSeen,
    markFirstAIInteraction,
    markFirstCorrectPick,
    recordQuestionAsked,
    recordResponseReceived,
  };
}
