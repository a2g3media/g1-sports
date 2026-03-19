import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Switch } from "@/react-app/components/ui/switch";
import { 
  ArrowLeft, Settings, Users, FileText, Loader2, Save, Copy, Check, 
  Shield, Crown, UserMinus, AlertCircle, DollarSign, Wallet, Grid3X3,
  Shuffle, Lock, Trophy, Calendar, MapPin
} from "lucide-react";
import { SPORTS, POOL_FORMATS } from "@/react-app/data/sports";
import { AIAssistant } from "@/react-app/components/AIAssistant";
import { cn } from "@/react-app/lib/utils";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
  rules_json: string;
  entry_fee_cents: number;
  is_payment_required: number;
  invite_code: string;
  is_active: number;
  member_count: number;
  role: string;
}

interface Member {
  id: number;
  user_id: string;
  role: string;
  is_payment_verified: number;
  created_at: string;
  display_name?: string;
  email?: string;
}

interface AuditEvent {
  id: number;
  event_type: string;
  user_id: string;
  actor_id: string;
  entity_type: string;
  payload_json: string;
  reason: string;
  created_at: string;
}

interface SquaresGrid {
  id: number;
  home_team: string;
  away_team: string;
  row_numbers: number[] | null;
  col_numbers: number[] | null;
  price_per_square_cents: number;
  is_numbers_revealed: boolean;
  game_date: string | null;
  game_time: string | null;
  venue: string | null;
  status: string;
}

interface QuarterScore {
  quarter: string;
  home_score: number | null;
  away_score: number | null;
  winning_square_id: number | null;
}

export function LeagueAdmin() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();
  
  const headers: HeadersInit = isDemoMode ? { "X-Demo-Mode": "true" } : {};

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Form state for settings
  const [formName, setFormName] = useState("");
  const [formSeason, setFormSeason] = useState("");
  const [formEntryFee, setFormEntryFee] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [showAIHelper, setShowAIHelper] = useState(false);

  // Squares grid state
  const [squaresGrid, setSquaresGrid] = useState<SquaresGrid | null>(null);
  const [squaresScores, setSquaresScores] = useState<QuarterScore[]>([]);
  const [squaresCount, setSquaresCount] = useState({ total: 0, claimed: 0 });
  const [isSquaresLoading, setIsSquaresLoading] = useState(false);
  const [isSquaresSaving, setIsSquaresSaving] = useState(false);
  
  // Squares form state
  const [gridHomeTeam, setGridHomeTeam] = useState("");
  const [gridAwayTeam, setGridAwayTeam] = useState("");
  const [gridGameDate, setGridGameDate] = useState("");
  const [gridGameTime, setGridGameTime] = useState("");
  const [gridVenue, setGridVenue] = useState("");
  const [gridPricePerSquare, setGridPricePerSquare] = useState("");
  
  // Scoring form
  const [scoreQuarter, setScoreQuarter] = useState("Q1");
  const [scoreHome, setScoreHome] = useState("");
  const [scoreAway, setScoreAway] = useState("");

  useEffect(() => {
    if (id) {
      fetchLeague();
      fetchMembers();
      fetchAuditLog();
    }
  }, [id]);

  const fetchSquaresData = useCallback(async () => {
    if (!id) return;
    setIsSquaresLoading(true);
    try {
      const response = await fetch(`/api/leagues/${id}/squares`, { headers });
      if (response.ok) {
        const data = await response.json();
        setSquaresGrid(data.grid);
        setSquaresScores(data.scores || []);
        const squares = data.squares || [];
        setSquaresCount({
          total: squares.length,
          claimed: squares.filter((s: { owner_id: string | null }) => s.owner_id !== null).length,
        });
        
        // Pre-populate form if grid exists
        if (data.grid) {
          setGridHomeTeam(data.grid.home_team || "");
          setGridAwayTeam(data.grid.away_team || "");
          setGridGameDate(data.grid.game_date || "");
          setGridGameTime(data.grid.game_time || "");
          setGridVenue(data.grid.venue || "");
          setGridPricePerSquare(data.grid.price_per_square_cents ? (data.grid.price_per_square_cents / 100).toString() : "");
        }
      }
    } catch (err) {
      console.error("Failed to fetch squares data:", err);
    } finally {
      setIsSquaresLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (league?.format_key === "squares") {
      fetchSquaresData();
    }
  }, [league?.format_key, fetchSquaresData]);

  const fetchLeague = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}`, { headers });
      if (!response.ok) throw new Error("Failed to fetch league");
      const data = await response.json();
      
      // Check if user is owner or admin
      if (data.role !== "owner" && data.role !== "admin") {
        navigate("/");
        return;
      }

      setLeague(data);
      setFormName(data.name);
      setFormSeason(data.season || "");
      setFormEntryFee(data.entry_fee_cents ? (data.entry_fee_cents / 100).toString() : "");
      setFormIsActive(data.is_active === 1);
    } catch {
      setError("Failed to load league");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}/members`, { headers });
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (err) {
      console.error("Failed to fetch members:", err);
    }
  };

  const fetchAuditLog = async () => {
    try {
      const response = await fetch(`/api/leagues/${id}/audit`, { headers });
      if (response.ok) {
        const data = await response.json();
        setAuditEvents(data);
      }
    } catch (err) {
      console.error("Failed to fetch audit log:", err);
    }
  };

  const handleSaveSettings = async () => {
    if (!league) return;
    
    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(`/api/leagues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          name: formName,
          season: formSeason,
          entryFeeCents: formEntryFee ? Math.round(parseFloat(formEntryFee) * 100) : 0,
          isActive: formIsActive,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save settings");
      }

      setSuccessMessage("Settings saved successfully");
      fetchLeague();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateMemberRole = async (memberId: number, newRole: string) => {
    try {
      const response = await fetch(`/api/leagues/${id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update role");
      }

      fetchMembers();
      fetchAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm("Are you sure you want to remove this member?")) return;

    try {
      const response = await fetch(`/api/leagues/${id}/members/${memberId}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove member");
      }

      fetchMembers();
      fetchAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const copyInviteCode = () => {
    if (league) {
      navigator.clipboard.writeText(league.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateGrid = async () => {
    if (!gridHomeTeam.trim() || !gridAwayTeam.trim()) {
      setError("Please enter both team names");
      return;
    }
    
    setIsSquaresSaving(true);
    setError("");
    
    try {
      const response = await fetch(`/api/leagues/${id}/squares`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          home_team: gridHomeTeam.trim(),
          away_team: gridAwayTeam.trim(),
          game_date: gridGameDate || null,
          game_time: gridGameTime || null,
          venue: gridVenue.trim() || null,
          price_per_square_cents: gridPricePerSquare ? Math.round(parseFloat(gridPricePerSquare) * 100) : 0,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create grid");
      }
      
      setSuccessMessage("Squares grid created! Members can now claim squares.");
      setTimeout(() => setSuccessMessage(""), 3000);
      fetchSquaresData();
      fetchAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create grid");
    } finally {
      setIsSquaresSaving(false);
    }
  };

  const handleRevealNumbers = async () => {
    if (!confirm("Are you sure you want to reveal the numbers? This will lock the grid and prevent any more claims.")) {
      return;
    }
    
    setIsSquaresSaving(true);
    setError("");
    
    try {
      const response = await fetch(`/api/leagues/${id}/squares/reveal-numbers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reveal numbers");
      }
      
      setSuccessMessage("Numbers revealed and grid locked!");
      setTimeout(() => setSuccessMessage(""), 3000);
      fetchSquaresData();
      fetchAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reveal numbers");
    } finally {
      setIsSquaresSaving(false);
    }
  };

  const handleUpdateScore = async () => {
    if (!scoreHome || !scoreAway) {
      setError("Please enter both scores");
      return;
    }
    
    setIsSquaresSaving(true);
    setError("");
    
    try {
      const response = await fetch(`/api/leagues/${id}/squares/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          quarter: scoreQuarter,
          home_score: parseInt(scoreHome),
          away_score: parseInt(scoreAway),
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update score");
      }
      
      const result = await response.json();
      setSuccessMessage(result.winner 
        ? `Score updated! Winner: ${result.winner}` 
        : "Score updated!");
      setTimeout(() => setSuccessMessage(""), 5000);
      setScoreHome("");
      setScoreAway("");
      fetchSquaresData();
      fetchAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update score");
    } finally {
      setIsSquaresSaving(false);
    }
  };

  const formatEventType = (type: string) => {
    return type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">League not found or access denied</p>
        <Link to="/">
          <Button variant="outline" className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const sport = SPORTS.find(s => s.key === league.sport_key);
  const format = POOL_FORMATS.find(f => f.key === league.format_key);
  const isSquaresFormat = league.format_key === "squares";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {sport && <sport.icon className="h-6 w-6" />}
            <h1 className="text-2xl font-bold tracking-tight">{league.name}</h1>
            <Badge variant={league.is_active ? "default" : "secondary"}>
              {league.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {format?.name} • {league.season} • {league.member_count} members
          </p>
        </div>
        <Button 
          onClick={() => setShowAIHelper(true)}
          variant="outline"
          className="gap-2 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50"
        >
          <span className="text-lg">👔</span>
          Ask Big G
        </Button>
      </div>

      {/* Big G AI Helper - Admin Assistant */}
      {showAIHelper && (
        <AIAssistant 
          leagueId={parseInt(id || "0")} 
          defaultPersona="big_g" 
          isOpen={showAIHelper}
          onClose={() => setShowAIHelper(false)}
        />
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-600 dark:text-green-400">
          <Check className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList className={cn("grid w-full", isSquaresFormat ? "grid-cols-5" : "grid-cols-4")}>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Members</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Audit</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Payments</span>
          </TabsTrigger>
          {isSquaresFormat && (
            <TabsTrigger value="squares" className="gap-2">
              <Grid3X3 className="h-4 w-4" />
              <span className="hidden sm:inline">Grid</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>League Settings</CardTitle>
              <CardDescription>Update your league configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">League Name</Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="My Awesome League"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="season">Season</Label>
                  <Input
                    id="season"
                    value={formSeason}
                    onChange={(e) => setFormSeason(e.target.value)}
                    placeholder="2024-2025"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Sport</Label>
                  <div className="p-3 bg-muted rounded-md flex items-center gap-2">
                    {sport && <sport.icon className="h-4 w-4" />}
                    <span>{sport?.name}</span>
                    <Badge variant="outline" className="ml-auto text-xs">Locked</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <div className="p-3 bg-muted rounded-md flex items-center gap-2">
                    <span>{format?.name}</span>
                    <Badge variant="outline" className="ml-auto text-xs">Locked</Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fee">Entry Fee (USD)</Label>
                <div className="relative max-w-xs">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formEntryFee}
                    onChange={(e) => setFormEntryFee(e.target.value)}
                    className="pl-9"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Set to 0 for free leagues. Entry fees are tracked for eligibility only.
                </p>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="active">League Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive leagues won't accept new members or picks
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                />
              </div>

              <Button onClick={handleSaveSettings} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invite Code</CardTitle>
              <CardDescription>Share this code with people you want to join</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <code className="flex-1 p-4 bg-muted rounded-lg text-2xl font-mono tracking-widest text-center">
                  {league.invite_code}
                </code>
                <Button variant="outline" size="icon" onClick={copyInviteCode}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>League Members ({members.length})</CardTitle>
              <CardDescription>Manage member roles and access</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.map((member) => (
                  <div 
                    key={member.id} 
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {member.role === "owner" ? (
                          <Crown className="h-5 w-5 text-amber-500" />
                        ) : member.role === "admin" ? (
                          <Shield className="h-5 w-5 text-blue-500" />
                        ) : (
                          <Users className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {member.display_name || `User ${member.user_id.slice(0, 8)}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Joined {formatDate(member.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {league.entry_fee_cents > 0 && (
                        <Badge 
                          variant={member.is_payment_verified ? "default" : "outline"}
                          className="text-xs"
                        >
                          {member.is_payment_verified ? "Paid" : "Unpaid"}
                        </Badge>
                      )}
                      {member.role !== "owner" && league.role === "owner" ? (
                        <>
                          <Select
                            value={member.role}
                            onValueChange={(value) => handleUpdateMemberRole(member.id, value)}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Badge variant={member.role === "owner" ? "default" : "secondary"} className="capitalize">
                          {member.role}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
              <CardDescription>
                Complete history of all league actions (append-only)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditEvents.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No events recorded yet
                </p>
              ) : (
                <div className="space-y-4">
                  {auditEvents.map((event) => (
                    <div key={event.id} className="flex gap-4 p-4 border rounded-lg">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {formatEventType(event.event_type)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(event.created_at)}
                          </span>
                        </div>
                        {event.payload_json && (
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {JSON.stringify(JSON.parse(event.payload_json))}
                          </p>
                        )}
                        {event.reason && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Reason: {event.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Payment Management
              </CardTitle>
              <CardDescription>
                Track entry fees, manage transactions, and verify payments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground">Entry Fee</span>
                  <span className="font-mono font-bold text-lg">
                    {league.entry_fee_cents > 0 
                      ? `$${(league.entry_fee_cents / 100).toFixed(2)}`
                      : "Free"
                    }
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Paid Members</span>
                  <span className="font-medium">
                    {members.filter(m => m.is_payment_verified).length} / {members.length}
                  </span>
                </div>
              </div>
              
              {league.entry_fee_cents > 0 ? (
                <Link to={`/leagues/${id}/payments`}>
                  <Button className="w-full gap-2">
                    <Wallet className="h-4 w-4" />
                    Open Payment Dashboard
                  </Button>
                </Link>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>This is a free league</p>
                  <p className="text-sm">Set an entry fee in Settings to enable payment tracking</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Squares Grid Tab */}
        {isSquaresFormat && (
          <TabsContent value="squares" className="space-y-6">
            {isSquaresLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !squaresGrid ? (
              /* Create New Grid Form */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Grid3X3 className="h-5 w-5" />
                    Create Squares Grid
                  </CardTitle>
                  <CardDescription>
                    Set up the game matchup for your squares pool
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="awayTeam">Away Team</Label>
                      <Input
                        id="awayTeam"
                        value={gridAwayTeam}
                        onChange={(e) => setGridAwayTeam(e.target.value)}
                        placeholder="e.g., Eagles"
                      />
                      <p className="text-xs text-muted-foreground">
                        Numbers appear across the top columns
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="homeTeam">Home Team</Label>
                      <Input
                        id="homeTeam"
                        value={gridHomeTeam}
                        onChange={(e) => setGridHomeTeam(e.target.value)}
                        placeholder="e.g., Chiefs"
                      />
                      <p className="text-xs text-muted-foreground">
                        Numbers appear down the side rows
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="gameDate" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Game Date
                      </Label>
                      <Input
                        id="gameDate"
                        type="date"
                        value={gridGameDate}
                        onChange={(e) => setGridGameDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gameTime">Game Time</Label>
                      <Input
                        id="gameTime"
                        type="time"
                        value={gridGameTime}
                        onChange={(e) => setGridGameTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="venue" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Venue (optional)
                    </Label>
                    <Input
                      id="venue"
                      value={gridVenue}
                      onChange={(e) => setGridVenue(e.target.value)}
                      placeholder="e.g., Allegiant Stadium, Las Vegas"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pricePerSquare" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Price Per Square (USD)
                    </Label>
                    <div className="relative max-w-xs">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="pricePerSquare"
                        type="number"
                        min="0"
                        step="0.01"
                        value={gridPricePerSquare}
                        onChange={(e) => setGridPricePerSquare(e.target.value)}
                        className="pl-9"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      100 squares × ${gridPricePerSquare || "0"} = ${(parseFloat(gridPricePerSquare || "0") * 100).toFixed(2)} total pot
                    </p>
                  </div>

                  <Button 
                    onClick={handleCreateGrid} 
                    disabled={isSquaresSaving || !gridHomeTeam || !gridAwayTeam}
                    className="gap-2"
                  >
                    {isSquaresSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Grid3X3 className="h-4 w-4" />
                    )}
                    Create Grid
                  </Button>
                </CardContent>
              </Card>
            ) : (
              /* Existing Grid Management */
              <>
                {/* Grid Status Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Grid3X3 className="h-5 w-5" />
                        Squares Grid
                      </span>
                      <Badge variant={squaresGrid.status === "open" ? "default" : "secondary"}>
                        {squaresGrid.status === "open" ? (
                          <><span className="mr-1">●</span> Open for Claims</>
                        ) : (
                          <><Lock className="h-3 w-3 mr-1" /> Locked</>
                        )}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {squaresGrid.away_team} @ {squaresGrid.home_team}
                      {squaresGrid.game_date && ` • ${squaresGrid.game_date}`}
                      {squaresGrid.venue && ` • ${squaresGrid.venue}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <div className="text-2xl font-bold">{squaresCount.claimed}</div>
                        <div className="text-sm text-muted-foreground">Claimed</div>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <div className="text-2xl font-bold">{100 - squaresCount.claimed}</div>
                        <div className="text-sm text-muted-foreground">Available</div>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <div className="text-2xl font-bold text-green-600">
                          ${((squaresGrid.price_per_square_cents || 0) * squaresCount.claimed / 100).toFixed(0)}
                        </div>
                        <div className="text-sm text-muted-foreground">Pot</div>
                      </div>
                    </div>

                    {/* Numbers Status */}
                    {squaresGrid.is_numbers_revealed ? (
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Check className="h-5 w-5 text-green-500" />
                          <span className="font-medium">Numbers Revealed</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{squaresGrid.away_team} (cols):</span>
                            <div className="font-mono mt-1">
                              {squaresGrid.col_numbers?.join(" - ") || "N/A"}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{squaresGrid.home_team} (rows):</span>
                            <div className="font-mono mt-1">
                              {squaresGrid.row_numbers?.join(" - ") || "N/A"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 border border-dashed rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">Numbers Hidden</div>
                            <p className="text-sm text-muted-foreground">
                              Reveal numbers when ready to lock the grid
                            </p>
                          </div>
                          <Button 
                            onClick={handleRevealNumbers}
                            disabled={isSquaresSaving || squaresCount.claimed < 10}
                            variant="outline"
                            className="gap-2"
                          >
                            {isSquaresSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Shuffle className="h-4 w-4" />
                            )}
                            Reveal Numbers
                          </Button>
                        </div>
                        {squaresCount.claimed < 10 && (
                          <p className="text-xs text-amber-600 mt-2">
                            At least 10 squares must be claimed before revealing numbers
                          </p>
                        )}
                      </div>
                    )}

                    <Link to={`/leagues/${id}/squares`}>
                      <Button variant="outline" className="w-full gap-2">
                        <Grid3X3 className="h-4 w-4" />
                        View Full Grid
                      </Button>
                    </Link>
                  </CardContent>
                </Card>

                {/* Score Entry Card (only if numbers revealed) */}
                {squaresGrid.is_numbers_revealed && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Trophy className="h-5 w-5" />
                        Enter Scores
                      </CardTitle>
                      <CardDescription>
                        Update quarter scores to determine winners
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Current Scores Display */}
                      <div className="grid grid-cols-4 gap-2">
                        {squaresScores.filter(s => s.quarter !== "Final").map((score) => (
                          <div 
                            key={score.quarter}
                            className={cn(
                              "p-3 rounded-lg text-center border",
                              score.home_score !== null 
                                ? "bg-muted border-border"
                                : "bg-background border-dashed"
                            )}
                          >
                            <div className="text-xs text-muted-foreground">{score.quarter}</div>
                            <div className="font-mono font-bold">
                              {score.home_score !== null 
                                ? `${score.away_score}-${score.home_score}`
                                : "--"
                              }
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Score Entry Form */}
                      <div className="p-4 border rounded-lg space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="space-y-2">
                            <Label>Quarter</Label>
                            <Select value={scoreQuarter} onValueChange={setScoreQuarter}>
                              <SelectTrigger className="w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Q1">Q1</SelectItem>
                                <SelectItem value="Q2">Q2</SelectItem>
                                <SelectItem value="Q3">Q3</SelectItem>
                                <SelectItem value="Q4">Q4</SelectItem>
                                <SelectItem value="Final">Final</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1 space-y-2">
                            <Label>{squaresGrid.away_team}</Label>
                            <Input
                              type="number"
                              min="0"
                              value={scoreAway}
                              onChange={(e) => setScoreAway(e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <Label>{squaresGrid.home_team}</Label>
                            <Input
                              type="number"
                              min="0"
                              value={scoreHome}
                              onChange={(e) => setScoreHome(e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <Button 
                          onClick={handleUpdateScore}
                          disabled={isSquaresSaving || !scoreHome || !scoreAway}
                          className="gap-2"
                        >
                          {isSquaresSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Update Score
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Winners are determined by the last digit of each team's score matching a square's row/column numbers.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
