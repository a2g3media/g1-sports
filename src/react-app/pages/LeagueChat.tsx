import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/react-app/components/ui/avatar";
import { Badge } from "@/react-app/components/ui/badge";
import {
  Send,
  ArrowLeft,
  Smile,
  Reply,
  MoreHorizontal,
  Heart,
  ThumbsUp,
  PartyPopper,
  Flame,
  Trophy,
  Users,
  AtSign,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/react-app/components/ui/popover";

interface Message {
  id: number;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  content: string;
  reply_to_id: number | null;
  reply_preview: string | null;
  reactions: Record<string, string[]>;
  is_edited: boolean;
  created_at: string;
}

interface Member {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
}

const REACTIONS = [
  { emoji: "👍", icon: ThumbsUp, label: "Like" },
  { emoji: "❤️", icon: Heart, label: "Love" },
  { emoji: "🎉", icon: PartyPopper, label: "Celebrate" },
  { emoji: "🔥", icon: Flame, label: "Fire" },
  { emoji: "🏆", icon: Trophy, label: "Trophy" },
];

export default function LeagueChat() {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isChatEnabled, setIsChatEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchChat();
    const interval = setInterval(fetchChat, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchChat = async () => {
    try {
      const res = await fetch(`/api/leagues/${id}/chat`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setMembers(data.members || []);
        setLeagueName(data.league_name || "League Chat");
        setIsChatEnabled(data.is_chat_enabled !== false);
      }
    } catch (err) {
      console.error("Failed to fetch chat:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/leagues/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newMessage.trim(),
          reply_to_id: replyTo?.id || null,
        }),
      });

      if (res.ok) {
        setNewMessage("");
        setReplyTo(null);
        fetchChat();
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  const handleReaction = async (messageId: number, emoji: string) => {
    try {
      await fetch(`/api/leagues/${id}/chat/${messageId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      fetchChat();
    } catch (err) {
      console.error("Failed to add reaction:", err);
    }
  };

  const handleMention = (member: Member) => {
    const beforeMention = newMessage.slice(0, newMessage.lastIndexOf("@"));
    setNewMessage(`${beforeMention}@${member.display_name} `);
    setMentionSearch(null);
    inputRef.current?.focus();
  };

  const handleInputChange = (value: string) => {
    setNewMessage(value);

    // Check for @mention
    const atIndex = value.lastIndexOf("@");
    if (atIndex !== -1) {
      const searchText = value.slice(atIndex + 1);
      if (!searchText.includes(" ")) {
        setMentionSearch(searchText.toLowerCase());
        return;
      }
    }
    setMentionSearch(null);
  };

  const filteredMembers = mentionSearch !== null
    ? members.filter((m) =>
        m.display_name.toLowerCase().includes(mentionSearch)
      )
    : [];

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const highlightMentions = (content: string) => {
    const mentionRegex = /@(\w+(?:\s\w+)?)/g;
    const parts = content.split(mentionRegex);

    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return (
          <span
            key={i}
            className="bg-primary/20 text-primary font-medium px-1 rounded"
          >
            @{part}
          </span>
        );
      }
      return part;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Chat disabled state
  if (!isChatEnabled) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            <Link to={`/leagues/${id}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="font-semibold text-foreground">{leagueName}</h1>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>{members.length} members</span>
              </div>
            </div>
          </div>
        </header>

        {/* Disabled Message */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Send className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg text-foreground mb-2">
              Chat is Disabled
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              The pool commissioner has disabled chat for this pool. Contact your commissioner if you believe this is a mistake.
            </p>
            <Link to={`/leagues/${id}`}>
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Pool
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link to={`/leagues/${id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold text-foreground">{leagueName}</h1>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>{members.length} members</span>
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4 mr-2" />
                Members
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground">
                  League Members
                </h4>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center gap-2"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(member.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm flex-1 truncate">
                        {member.display_name}
                      </span>
                      {member.role === "owner" && (
                        <Badge variant="secondary" className="text-xs">
                          Owner
                        </Badge>
                      )}
                      {member.role === "admin" && (
                        <Badge variant="outline" className="text-xs">
                          Admin
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Send className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">
                No messages yet
              </h3>
              <p className="text-sm text-muted-foreground">
                Be the first to say something!
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const showAvatar =
                index === 0 || messages[index - 1].user_id !== msg.user_id;
              const isConsecutive =
                index > 0 && messages[index - 1].user_id === msg.user_id;

              return (
                <div
                  key={msg.id}
                  className={`group flex gap-3 ${isConsecutive ? "mt-1" : "mt-4"}`}
                >
                  {showAvatar ? (
                    <Avatar className="h-9 w-9 flex-shrink-0">
                      <AvatarImage src={msg.user_avatar || undefined} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(msg.user_name)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="w-9" />
                  )}

                  <div className="flex-1 min-w-0">
                    {showAvatar && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground text-sm">
                          {msg.user_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(msg.created_at)}
                        </span>
                        {msg.is_edited && (
                          <span className="text-xs text-muted-foreground">
                            (edited)
                          </span>
                        )}
                      </div>
                    )}

                    {msg.reply_preview && (
                      <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                        <Reply className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">
                          {msg.reply_preview}
                        </span>
                      </div>
                    )}

                    <div className="relative bg-muted/50 rounded-lg px-3 py-2 inline-block max-w-full">
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                        {highlightMentions(msg.content)}
                      </p>

                      {/* Message Actions */}
                      <div className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-card border border-border rounded-lg shadow-sm px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                            >
                              <Smile className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2">
                            <div className="flex gap-1">
                              {REACTIONS.map((r) => (
                                <Button
                                  key={r.emoji}
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-lg"
                                  onClick={() => handleReaction(msg.id, r.emoji)}
                                >
                                  {r.emoji}
                                </Button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setReplyTo(msg)}
                        >
                          <Reply className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content);
                              }}
                            >
                              Copy text
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Reactions */}
                    {Object.keys(msg.reactions || {}).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(msg.id, emoji)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full text-xs hover:bg-muted/80 transition-colors"
                          >
                            <span>{emoji}</span>
                            <span className="text-muted-foreground">
                              {users.length}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Reply Preview */}
      {replyTo && (
        <div className="border-t border-border bg-muted/50 px-4 py-2">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <Reply className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Replying to{" "}
              <span className="font-medium text-foreground">
                {replyTo.user_name}
              </span>
            </span>
            <span className="text-sm text-muted-foreground truncate flex-1">
              {replyTo.content.slice(0, 50)}
              {replyTo.content.length > 50 && "..."}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setReplyTo(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Mention Suggestions */}
      {filteredMembers.length > 0 && (
        <div className="border-t border-border bg-card px-4 py-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <AtSign className="h-3 w-3" />
              <span>Mention a member</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {filteredMembers.slice(0, 5).map((member) => (
                <button
                  key={member.user_id}
                  onClick={() => handleMention(member)}
                  className="flex items-center gap-2 px-2 py-1 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(member.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{member.display_name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-0 border-t border-border bg-card px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message... Use @ to mention"
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!newMessage.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
