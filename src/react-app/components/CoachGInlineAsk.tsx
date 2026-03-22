import { useMemo, useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useGlobalAI } from "@/react-app/components/GlobalAIProvider";

interface CoachGInlineAskProps {
  gameId?: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  replyClassName?: string;
  placeholder?: string;
}

export function CoachGInlineAsk({
  gameId,
  className,
  inputClassName,
  buttonClassName,
  replyClassName,
  placeholder = "Ask Coach G about this matchup...",
}: CoachGInlineAskProps) {
  const { getInlineTurns, appendInlineTurn, clearInlineThread } = useGlobalAI();
  const [threadMode, setThreadMode] = useState<"game" | "global">(gameId ? "game" : "global");
  const threadKey = useMemo(() => {
    if (!gameId) return "global";
    return threadMode === "game" ? `game:${gameId}` : "global";
  }, [gameId, threadMode]);
  const turns = getInlineTurns(threadKey);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = question.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    appendInlineTurn(threadKey, {
      id: `${Date.now()}-u`,
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
      gameId,
    });

    try {
      const response = await fetch("/api/coachg/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          game_id: gameId || undefined,
        }),
      });

      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        const backendError = typeof data?.error === "string" ? data.error : "Unable to get Coach G response right now.";
        throw new Error(backendError);
      }

      const text = typeof data?.reply === "string" ? data.reply.trim() : "";
      appendInlineTurn(threadKey, {
        id: `${Date.now()}-a`,
        role: "assistant",
        content: text || "Coach G has no update yet. Try another angle on this matchup.",
        createdAt: Date.now(),
        gameId,
      });
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send question right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("mt-3", className)}>
      {gameId && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/25 p-1">
          <button
            type="button"
            onClick={() => setThreadMode("game")}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors",
              threadMode === "game"
                ? "bg-cyan-500/20 text-cyan-100"
                : "text-[#9CA3AF] hover:text-[#E5E7EB]"
            )}
          >
            This Game
          </button>
          <button
            type="button"
            onClick={() => setThreadMode("global")}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors",
              threadMode === "global"
                ? "bg-violet-500/20 text-violet-100"
                : "text-[#9CA3AF] hover:text-[#E5E7EB]"
            )}
          >
            Global
          </button>
        </div>
      )}
      {turns.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {turns.slice(-4).map((turn) => (
            <p
              key={turn.id}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-xs",
                turn.role === "assistant"
                  ? cn("border-white/10 bg-black/30 text-[#E5E7EB]", replyClassName)
                  : "border-cyan-400/20 bg-cyan-500/10 text-cyan-100"
              )}
            >
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {turn.role === "assistant" ? "Coach G" : "You"}
              </span>
              {turn.content}
            </p>
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => clearInlineThread(threadKey)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-[#9CA3AF] transition-colors hover:text-[#E5E7EB]"
            >
              <RotateCcw className="h-3 w-3" />
              Clear
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          disabled={isSubmitting}
          className={cn(
            "h-8 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 text-xs text-[#E5E7EB] outline-none placeholder:text-[#9CA3AF] focus:border-cyan-300/45",
            inputClassName
          )}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSubmitting || !question.trim()}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/14 px-2.5 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/24 disabled:cursor-not-allowed disabled:opacity-45",
            buttonClassName
          )}
        >
          <Send className="h-3.5 w-3.5" />
          {isSubmitting ? "Asking..." : "Ask"}
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-amber-300/90">{error}</p>}
    </div>
  );
}

export default CoachGInlineAsk;
