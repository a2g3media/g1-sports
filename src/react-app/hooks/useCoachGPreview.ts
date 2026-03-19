import { useState, useCallback, useEffect } from 'react';

interface RosterFreshness {
  status: 'verified_live_roster' | 'limited_roster_certainty';
  badge: 'Verified live roster' | 'Limited roster certainty';
  score: number;
  capturedAt: string | null;
  note: string;
}

interface PreviewContent {
  headline: string;
  sections: Array<{
    title: string;
    content: string;
    icon?: string;
  }>;
  coachGPick?: {
    pick: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  };
  sources: Array<{
    name: string;
    snippetCount: number;
  }>;
  generatedAt: string;
  rosterFreshness?: RosterFreshness;
}

interface GamePreview {
  id: number;
  game_id: string;
  sport: string;
  rosterFreshness?: RosterFreshness;
  content: PreviewContent;
  sources_used: string[];
  generated_at: string;
  expires_at: string;
  word_count: number;
  created_at: string;
  updated_at: string;
}

interface UseCoachGPreviewReturn {
  preview: GamePreview | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  generatePreview: () => Promise<void>;
  refreshPreview: () => Promise<void>;
}

export function useCoachGPreview(gameId: string | undefined): UseCoachGPreviewReturn {
  const [preview, setPreview] = useState<GamePreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing preview
  const fetchPreview = useCallback(async () => {
    if (!gameId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/coach-g-preview/${gameId}`);
      
      if (response.status === 404) {
        // Automatically enqueue generation on first miss so article content backfills.
        const generateResponse = await fetch(`/api/coach-g-preview/${gameId}`, {
          method: "POST",
        });
        if (generateResponse.ok) {
          const generated = await generateResponse.json();
          setPreview(generated.preview || null);
        } else {
          setPreview(null);
        }
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to load preview');
      }
      
      const data = await response.json();
      setPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setIsLoading(false);
    }
  }, [gameId]);

  // Generate new preview
  const generatePreview = useCallback(async () => {
    if (!gameId) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/coach-g-preview/${gameId}`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate preview');
      }
      
      const data = await response.json();
      setPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setIsGenerating(false);
    }
  }, [gameId]);

  // Refresh (force regenerate) preview
  const refreshPreview = useCallback(async () => {
    if (!gameId) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/coach-g-preview/${gameId}/refresh`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to refresh preview');
      }
      
      const data = await response.json();
      setPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh preview');
    } finally {
      setIsGenerating(false);
    }
  }, [gameId]);

  // Load preview on mount
  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  return {
    preview,
    isLoading,
    isGenerating,
    error,
    generatePreview,
    refreshPreview,
  };
}
