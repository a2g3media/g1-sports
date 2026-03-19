import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Input } from "@/react-app/components/ui/input";
import { 
  MessageSquare, Trophy, Target, TrendingUp, Flame, Star,
  Send, Loader2, ChevronDown
} from "lucide-react";
import { useSocialMode } from "@/react-app/contexts/SocialModeContext";

interface FeedItem {
  id: number;
  type: "pick_submitted" | "achievement" | "milestone" | "streak" | "comment" | "weekly_recap";
  user_id: string;
  user_name: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface LeagueFeedProps {
  leagueId: number;
}

export function LeagueFeed({ leagueId }: LeagueFeedProps) {
  const { isSocialMode } = useSocialMode();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (isSocialMode) {
      fetchFeed();
    } else {
      setIsLoading(false);
    }
  }, [leagueId, isSocialMode]);

  const fetchFeed = async () => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/feed`);
      if (response.ok) {
        const data = await response.json();
        setFeedItems(data);
      }
    } catch (error) {
      console.error("Failed to fetch feed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/leagues/${leagueId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment }),
      });
      
      if (response.ok) {
        setNewComment("");
        fetchFeed();
      }
    } catch (error) {
      console.error("Failed to post comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // If social mode is disabled globally, don't render
  if (!isSocialMode) {
    return null;
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getItemIcon = (type: FeedItem["type"]) => {
    switch (type) {
      case "achievement": return <Trophy className="h-4 w-4 text-amber-500" />;
      case "milestone": return <Star className="h-4 w-4 text-blue-500" />;
      case "streak": return <Flame className="h-4 w-4 text-orange-500" />;
      case "pick_submitted": return <Target className="h-4 w-4 text-emerald-500" />;
      case "weekly_recap": return <TrendingUp className="h-4 w-4 text-violet-500" />;
      case "comment": return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getItemStyle = (type: FeedItem["type"]) => {
    // Slightly warmer accents for social mode, but still professional
    switch (type) {
      case "achievement": return "border-l-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10";
      case "milestone": return "border-l-blue-400/50 bg-blue-50/30 dark:bg-blue-950/10";
      case "streak": return "border-l-orange-400/50 bg-orange-50/30 dark:bg-orange-950/10";
      case "weekly_recap": return "border-l-violet-400/50 bg-violet-50/30 dark:bg-violet-950/10";
      default: return "border-l-border";
    }
  };

  const displayedItems = showAll ? feedItems : feedItems.slice(0, 5);

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            League Activity
          </CardTitle>
          <Badge variant="secondary" className="text-xs font-normal">
            Social Mode
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comment Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Share a thought with the league..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmitComment()}
            className="flex-1"
          />
          <Button 
            size="icon" 
            onClick={handleSubmitComment}
            disabled={isSubmitting || !newComment.trim()}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Feed Items */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : feedItems.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No activity yet. Be the first to share something.
          </div>
        ) : (
          <div className="space-y-2">
            {displayedItems.map((item) => (
              <div 
                key={item.id} 
                className={`p-3 rounded-lg border-l-2 ${getItemStyle(item.type)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getItemIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{item.user_name}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(item.created_at)}</span>
                    </div>
                    <p className="text-sm mt-0.5 text-foreground/90">{item.content}</p>
                  </div>
                </div>
              </div>
            ))}
            
            {feedItems.length > 5 && !showAll && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-muted-foreground"
                onClick={() => setShowAll(true)}
              >
                <ChevronDown className="h-4 w-4 mr-1" />
                Show {feedItems.length - 5} more
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
