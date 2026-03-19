import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { 
  ArrowLeft, Loader2, Check, X, DollarSign, Shield, Users, 
  RefreshCw, AlertCircle, CheckCircle2, Clock,
  CreditCard, Wallet, Receipt, Ban, UserCheck, Lock
} from "lucide-react";
import { SPORTS } from "@/react-app/data/sports";

interface Member {
  id: number;
  user_id: string;
  role: string;
  display_name?: string;
  email?: string;
  is_payment_verified: number;
  payment_verified_at?: string;
  created_at: string;
}

interface Transaction {
  id: number;
  user_id: string;
  display_name?: string;
  provider: string;
  provider_txn_id?: string;
  intent_type: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  status: string;
  completed_at?: string;
  created_at: string;
}

interface League {
  id: number;
  name: string;
  sport_key: string;
  entry_fee_cents: number;
  is_payment_required: number;
  role: string;
}

interface EligibilityStatus {
  user_id: string;
  display_name?: string;
  is_eligible: boolean;
  has_paid: boolean;
  has_submitted_picks: boolean;
  picks_count: number;
}

const ESCROW_PROVIDERS = [
  { id: "venmo", name: "Venmo", icon: "💜" },
  { id: "paypal", name: "PayPal", icon: "🅿️" },
  { id: "zelle", name: "Zelle", icon: "💸" },
  { id: "cashapp", name: "Cash App", icon: "💵" },
  { id: "manual", name: "Cash/Check", icon: "💰" },
];

export function LeaguePayments() {
  const { id } = useParams<{ id: string }>();
  
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [eligibility, setEligibility] = useState<EligibilityStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  // Record payment form
  const [selectedMember, setSelectedMember] = useState("");
  const [paymentProvider, setPaymentProvider] = useState("venmo");
  const [paymentTxnId, setPaymentTxnId] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (id) {
      fetchAll();
    }
  }, [id]);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [leagueRes, membersRes, txnRes, eligRes] = await Promise.all([
        fetch(`/api/leagues/${id}`),
        fetch(`/api/leagues/${id}/members`),
        fetch(`/api/leagues/${id}/payments`),
        fetch(`/api/leagues/${id}/eligibility`),
      ]);
      
      if (leagueRes.ok) setLeague(await leagueRes.json());
      if (membersRes.ok) setMembers(await membersRes.json());
      if (txnRes.ok) setTransactions(await txnRes.json());
      if (eligRes.ok) setEligibility(await eligRes.json());
    } catch {
      setError("Failed to load payment data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPayment = async (memberId: number, verify: boolean) => {
    try {
      const response = await fetch(`/api/leagues/${id}/payments/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, verified: verify }),
      });
      
      if (!response.ok) throw new Error("Failed to update payment status");
      
      setSuccessMessage(verify ? "Payment verified" : "Payment verification removed");
      setTimeout(() => setSuccessMessage(""), 3000);
      fetchAll();
    } catch {
      setError("Failed to update payment status");
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !paymentProvider) return;
    
    setIsRecording(true);
    setError("");
    
    try {
      const response = await fetch(`/api/leagues/${id}/payments/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedMember,
          provider: paymentProvider,
          providerTxnId: paymentTxnId || undefined,
          amountCents: league?.entry_fee_cents || 0,
        }),
      });
      
      if (!response.ok) throw new Error("Failed to record payment");
      
      setSuccessMessage("Payment recorded and member verified");
      setSelectedMember("");
      setPaymentTxnId("");
      setTimeout(() => setSuccessMessage(""), 3000);
      fetchAll();
    } catch {
      setError("Failed to record payment");
    } finally {
      setIsRecording(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30">Completed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">Failed</Badge>;
      case "refunded":
        return <Badge className="bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30">Refunded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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
        <p className="text-muted-foreground">League not found</p>
        <Link to="/">
          <Button variant="outline" className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const sport = SPORTS.find(s => s.key === league.sport_key);
  const paidCount = members.filter(m => m.is_payment_verified).length;
  const unpaidCount = members.length - paidCount;
  const totalCollected = transactions.filter(t => t.status === "completed" && t.intent_type === "entry_fee").reduce((sum, t) => sum + t.amount_cents, 0);
  const expectedTotal = members.length * league.entry_fee_cents;
  const unpaidMembers = members.filter(m => !m.is_payment_verified);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={`/leagues/${id}/admin`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {sport && <sport.icon className="h-6 w-6" />}
            <h1 className="text-2xl font-bold tracking-tight">{league.name}</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Escrow Gateway • Payment & Eligibility Tracking
          </p>
        </div>
        <Button variant="outline" onClick={fetchAll} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError("")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Entry Fee</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(league.entry_fee_cents)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Paid Members</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {paidCount} / {members.length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <UserCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collected</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(totalCollected)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {formatCurrency(expectedTotal - totalCollected)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Important Notice */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-600 dark:text-blue-400">Escrow Gateway Mode</h3>
              <p className="text-sm text-muted-foreground mt-1">
                POOLVAULT does not hold funds. This dashboard tracks payment verification and eligibility status only.
                All payments should be processed through your preferred external payment service (Venmo, PayPal, etc.).
                Record payments here to verify member eligibility.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="members" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Member Status
          </TabsTrigger>
          <TabsTrigger value="record" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Record Payment
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-2">
            <Receipt className="h-4 w-4" />
            Transaction Log
          </TabsTrigger>
        </TabsList>

        {/* Member Status Tab */}
        <TabsContent value="members" className="space-y-4">
          {/* Unpaid Members Alert */}
          {unpaidCount > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {unpaidCount} member{unpaidCount > 1 ? "s" : ""} haven't paid yet
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Payment & Eligibility Status</CardTitle>
              <CardDescription>
                Verify payments to unlock pick submission for members
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.map((member) => {
                  const memberEligibility = eligibility.find(e => e.user_id === member.user_id);
                  
                  return (
                    <div 
                      key={member.id} 
                      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 border rounded-lg transition-colors ${
                        member.is_payment_verified 
                          ? "bg-green-500/5 border-green-500/20" 
                          : "bg-amber-500/5 border-amber-500/20"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          member.is_payment_verified 
                            ? "bg-green-500/20" 
                            : "bg-amber-500/20"
                        }`}>
                          {member.is_payment_verified ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.display_name || `User ${member.user_id.slice(0, 8)}`}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs capitalize">
                              {member.role}
                            </Badge>
                            {member.payment_verified_at && (
                              <span>Verified {formatDate(member.payment_verified_at)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 sm:ml-0 ml-[52px]">
                        {/* Eligibility Indicators */}
                        <div className="flex items-center gap-2">
                          {memberEligibility?.is_eligible ? (
                            <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30 gap-1">
                              <Lock className="h-3 w-3" />
                              Eligible
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 gap-1">
                              <Ban className="h-3 w-3" />
                              Not Eligible
                            </Badge>
                          )}
                        </div>

                        {/* Payment Status Toggle */}
                        {member.is_payment_verified ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                            onClick={() => handleVerifyPayment(member.id, false)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Unverify
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleVerifyPayment(member.id, true)}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Verify Paid
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Record Payment Tab */}
        <TabsContent value="record" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Record External Payment</CardTitle>
              <CardDescription>
                Log a payment received through an external service (Venmo, PayPal, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div className="space-y-2">
                  <Label>Member</Label>
                  <Select value={selectedMember} onValueChange={setSelectedMember}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select member to record payment for" />
                    </SelectTrigger>
                    <SelectContent>
                      {unpaidMembers.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          All members have paid
                        </SelectItem>
                      ) : (
                        unpaidMembers.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.display_name || `User ${member.user_id.slice(0, 8)}`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Payment Provider</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {ESCROW_PROVIDERS.map((provider) => (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => setPaymentProvider(provider.id)}
                        className={`p-3 rounded-lg border text-center transition-all ${
                          paymentProvider === provider.id
                            ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <span className="text-2xl block mb-1">{provider.icon}</span>
                        <span className="text-xs">{provider.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="amount"
                        value={formatCurrency(league.entry_fee_cents).replace("$", "")}
                        disabled
                        className="pl-9 bg-muted"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="txnId">Transaction ID (optional)</Label>
                    <Input
                      id="txnId"
                      value={paymentTxnId}
                      onChange={(e) => setPaymentTxnId(e.target.value)}
                      placeholder="e.g., 3847293847"
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={!selectedMember || isRecording}
                  className="w-full gap-2"
                >
                  {isRecording ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Receipt className="h-4 w-4" />
                  )}
                  Record Payment & Verify Member
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Ledger</CardTitle>
              <CardDescription>
                Complete history of all recorded payments (append-only)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No transactions recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((txn) => {
                    const provider = ESCROW_PROVIDERS.find(p => p.id === txn.provider);
                    
                    return (
                      <div 
                        key={txn.id} 
                        className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xl">
                            {provider?.icon || "💳"}
                          </div>
                          <div>
                            <p className="font-medium">
                              {txn.display_name || `User ${txn.user_id.slice(0, 8)}`}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="capitalize">{txn.provider}</span>
                              {txn.provider_txn_id && (
                                <>
                                  <span>•</span>
                                  <code className="bg-muted px-1 rounded">{txn.provider_txn_id}</code>
                                </>
                              )}
                              <span>•</span>
                              <span>{formatDate(txn.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(txn.status)}
                          <span className="font-mono font-bold text-lg">
                            {formatCurrency(txn.amount_cents)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
