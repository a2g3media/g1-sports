/**
 * CoachGActionButtons - Renders action buttons in Coach G responses
 * 
 * Mobile-first design with 44px+ tap targets
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Plus, 
  Eye, 
  TrendingUp, 
  User, 
  Zap,
  ChevronRight,
  Check,
  Loader2
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { 
  type ActionButton, 
  type ActionIntent,
  executeAction,
  type ActionExecutionResult 
} from "@/react-app/lib/coachGActionEngine";
import { useWatchboards } from "@/react-app/hooks/useWatchboards";
import { toast } from "sonner";

interface CoachGActionButtonsProps {
  buttons: ActionButton[];
  onActionComplete?: (result: ActionExecutionResult) => void;
  className?: string;
}

// Icon mapping for action types
const ACTION_ICONS: Record<ActionIntent, React.ElementType> = {
  watch_game: Plus,
  follow_team: Eye,
  follow_player: User,
  track_player: User,
  open_odds: TrendingUp,
  open_game: Eye,
  build_parlay: Zap,
  show_sharp_radar: TrendingUp,
  show_value_bets: TrendingUp,
  none: ChevronRight,
};

// Variant styles
const VARIANT_STYLES = {
  primary: cn(
    "bg-primary text-primary-foreground",
    "hover:bg-primary/90",
    "shadow-lg shadow-primary/25",
    "border-primary"
  ),
  secondary: cn(
    "bg-white/10 text-white",
    "hover:bg-white/20",
    "border-white/20"
  ),
  outline: cn(
    "bg-transparent text-white/80",
    "hover:bg-white/10 hover:text-white",
    "border-white/30"
  ),
};

export function CoachGActionButtons({ 
  buttons, 
  onActionComplete,
  className 
}: CoachGActionButtonsProps) {
  const navigate = useNavigate();
  const { addGameToBoard, activeBoard, boards } = useWatchboards();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());

  if (!buttons || buttons.length === 0) return null;

  const handleAction = async (button: ActionButton) => {
    const actionKey = `${button.action}-${button.data?.team || button.data?.player || 'default'}`;
    
    // Prevent double-click
    if (loadingAction || completedActions.has(actionKey)) return;
    
    setLoadingAction(actionKey);
    
    try {
      // Get the board to add to (active board or first board)
      const targetBoardId = activeBoard?.id || boards[0]?.id || 1;
      
      const result = await executeAction(
        button,
        undefined,
        async (gameId: string) => {
          await addGameToBoard(gameId, targetBoardId, 'coach-g');
        }
      );
      
      if (result.success) {
        setCompletedActions(prev => new Set(prev).add(actionKey));
        
        // Show toast confirmation
        if (result.message) {
          toast.success(result.message);
        }
        
        // Navigate if specified
        if (result.navigateTo) {
          setTimeout(() => {
            navigate(result.navigateTo!);
          }, 300);
        }
        
        onActionComplete?.(result);
      } else {
        toast.error(result.message || 'Action failed');
      }
    } catch (error) {
      console.error('Action execution error:', error);
      toast.error('Something went wrong');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-2 mt-3", className)}>
      {buttons.map((button, index) => {
        const Icon = ACTION_ICONS[button.action] || ChevronRight;
        const actionKey = `${button.action}-${button.data?.team || button.data?.player || 'default'}`;
        const isLoading = loadingAction === actionKey;
        const isCompleted = completedActions.has(actionKey);
        
        return (
          <button
            key={`${button.action}-${index}`}
            onClick={() => handleAction(button)}
            disabled={isLoading || isCompleted}
            className={cn(
              // Base styles - 44px min touch target
              "min-h-[44px] px-4 py-2.5 rounded-xl",
              "font-medium text-sm",
              "flex items-center gap-2",
              "border transition-all duration-200",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              // Active state feedback
              "active:scale-[0.98]",
              // Variant styles
              VARIANT_STYLES[button.variant],
              // Completed state
              isCompleted && "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isCompleted ? (
              <Check className="w-4 h-4" />
            ) : (
              <Icon className="w-4 h-4" />
            )}
            <span>{isCompleted ? 'Done' : button.label}</span>
            {!isLoading && !isCompleted && button.variant === 'primary' && (
              <ChevronRight className="w-4 h-4 opacity-60" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// Compact version for inline use
export function CoachGActionChips({ 
  buttons,
  onActionComplete,
  className 
}: CoachGActionButtonsProps) {
  const navigate = useNavigate();
  const { addGameToBoard, activeBoard, boards } = useWatchboards();
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());

  if (!buttons || buttons.length === 0) return null;

  const handleAction = async (button: ActionButton) => {
    const actionKey = `${button.action}-${button.data?.team || button.data?.player || 'default'}`;
    
    if (completedActions.has(actionKey)) return;
    
    // Get the board to add to (active board or first board)
    const targetBoardId = activeBoard?.id || boards[0]?.id || 1;
    
    const result = await executeAction(
      button,
      undefined,
      async (gameId: string) => {
        await addGameToBoard(gameId, targetBoardId, 'coach-g');
      }
    );
    
    if (result.success) {
      setCompletedActions(prev => new Set(prev).add(actionKey));
      
      if (result.navigateTo) {
        navigate(result.navigateTo);
      }
      
      onActionComplete?.(result);
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-1.5 mt-2", className)}>
      {buttons.map((button, index) => {
        const Icon = ACTION_ICONS[button.action] || ChevronRight;
        const actionKey = `${button.action}-${button.data?.team || button.data?.player || 'default'}`;
        const isCompleted = completedActions.has(actionKey);
        
        return (
          <button
            key={`${button.action}-${index}`}
            onClick={() => handleAction(button)}
            disabled={isCompleted}
            className={cn(
              "min-h-[36px] px-3 py-1.5 rounded-lg",
              "text-xs font-medium",
              "flex items-center gap-1.5",
              "bg-white/5 border border-white/10",
              "hover:bg-white/10 hover:border-white/20",
              "transition-all duration-150",
              "disabled:opacity-50",
              isCompleted && "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            )}
          >
            {isCompleted ? (
              <Check className="w-3 h-3" />
            ) : (
              <Icon className="w-3 h-3 opacity-70" />
            )}
            <span>{button.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Confirmation message component
interface ActionConfirmationProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function ActionConfirmation({ message, onDismiss, className }: ActionConfirmationProps) {
  return (
    <div 
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl",
        "bg-emerald-500/10 border border-emerald-500/30",
        "animate-in slide-in-from-bottom-2 fade-in duration-300",
        className
      )}
    >
      <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
        <Check className="w-4 h-4 text-emerald-400" />
      </div>
      <p className="text-sm text-emerald-300 flex-1">{message}</p>
      {onDismiss && (
        <button 
          onClick={onDismiss}
          className="text-emerald-400/60 hover:text-emerald-400 text-xs"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
