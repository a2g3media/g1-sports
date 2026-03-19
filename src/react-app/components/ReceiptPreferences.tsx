import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Label } from "@/react-app/components/ui/label";
import { Input } from "@/react-app/components/ui/input";
import { Button } from "@/react-app/components/ui/button";
import { Switch } from "@/react-app/components/ui/switch";
import { Badge } from "@/react-app/components/ui/badge";
import { Separator } from "@/react-app/components/ui/separator";
import { 
  Receipt, Mail, Smartphone, Check, Loader2, Shield, 
  ChevronRight, CheckCircle, AlertCircle, X, RefreshCw
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Link } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

type ConfirmChannel = "email" | "sms" | "both" | "none";

interface ConfirmationPreferences {
  confirm_channel: ConfirmChannel;
  confirm_pick_submission: boolean;
  confirm_pick_lock_reminder: boolean;
  weekly_recap_opt_in: boolean;
}

interface PhoneStatus {
  number: string | null;
  verified: boolean;
}

export function ReceiptPreferences() {
  const { user, isDemoMode } = useDemoAuth();
  const [preferences, setPreferences] = useState<ConfirmationPreferences | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Phone verification state
  const [verifyMode, setVerifyMode] = useState<"idle" | "entering" | "sent" | "confirming">("idle");
  const [phoneInput, setPhoneInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  
  // Load preferences
  useEffect(() => {
    if (isDemoMode || !user?.id) {
      setLoading(false);
      return;
    }
    const loadPreferences = async () => {
      try {
        const res = await fetch("/api/receipts/preferences/confirmations");
        if (res.status === 401 || res.status === 403) return;
        if (res.ok) {
          const data = await res.json();
          setPreferences(data.preferences);
          setPhoneStatus(data.phone);
        }
      } catch (err) {
        console.error("Failed to load receipt preferences:", err);
      } finally {
        setLoading(false);
      }
    };
    loadPreferences();
  }, [isDemoMode, user?.id]);
  
  // Countdown timer for OTP expiration
  useEffect(() => {
    if (expiresIn === null || expiresIn <= 0) return;
    const timer = setInterval(() => {
      setExpiresIn(prev => prev !== null && prev > 0 ? prev - 1 : null);
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresIn]);
  
  const updatePreference = useCallback(async <K extends keyof ConfirmationPreferences>(
    key: K,
    value: ConfirmationPreferences[K]
  ) => {
    if (!preferences) return;
    if (isDemoMode || !user?.id) return;
    
    // Optimistic update
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    setSaving(true);
    
    try {
      const res = await fetch("/api/receipts/preferences/confirmations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        // Revert on error
        setPreferences(preferences);
        if (data.error?.includes("verified phone")) {
          setVerifyMode("entering");
          setVerifyError("Please verify your phone number first to enable SMS");
        }
      }
    } catch (err) {
      setPreferences(preferences);
    } finally {
      setSaving(false);
    }
  }, [isDemoMode, preferences, user?.id]);
  
  const handleChannelChange = (channel: ConfirmChannel) => {
    // If selecting SMS or both, check if phone is verified
    if ((channel === "sms" || channel === "both") && !phoneStatus?.verified) {
      setVerifyMode("entering");
      setVerifyError("Verify your phone number to receive SMS confirmations");
      return;
    }
    updatePreference("confirm_channel", channel);
  };
  
  const formatPhoneInput = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };
  
  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value);
    setPhoneInput(formatted);
    setVerifyError(null);
  };
  
  const handleOtpInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtpInput(value);
    setVerifyError(null);
  };
  
  const sendVerificationCode = async () => {
    if (isDemoMode || !user?.id) return;
    const cleanPhone = phoneInput.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      setVerifyError("Please enter a valid 10-digit phone number");
      return;
    }
    
    setVerifyMode("confirming");
    setVerifyError(null);
    
    try {
      const res = await fetch("/api/receipts/preferences/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setVerifyMode("sent");
        setExpiresIn(data.expires_in_seconds || 600);
        // For dev mode, show the OTP in console
        if (data._dev_otp) {
          console.log("DEV OTP:", data._dev_otp);
        }
      } else {
        setVerifyMode("entering");
        setVerifyError(data.error || "Failed to send verification code");
      }
    } catch (err) {
      setVerifyMode("entering");
      setVerifyError("Failed to send verification code");
    }
  };
  
  const confirmVerificationCode = async () => {
    if (isDemoMode || !user?.id) return;
    if (otpInput.length !== 6) {
      setVerifyError("Please enter the 6-digit code");
      return;
    }
    
    setVerifyMode("confirming");
    setVerifyError(null);
    
    try {
      const res = await fetch("/api/receipts/preferences/phone/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpInput }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setPhoneStatus({ number: data.phone_display, verified: true });
        setVerifyMode("idle");
        setVerifySuccess("Phone verified! You can now receive SMS confirmations.");
        setPhoneInput("");
        setOtpInput("");
        setExpiresIn(null);
        
        // Clear success message after 5 seconds
        setTimeout(() => setVerifySuccess(null), 5000);
      } else {
        setVerifyMode("sent");
        setVerifyError(data.error || "Invalid code");
      }
    } catch (err) {
      setVerifyMode("sent");
      setVerifyError("Failed to verify code");
    }
  };
  
  const cancelVerification = () => {
    setVerifyMode("idle");
    setPhoneInput("");
    setOtpInput("");
    setVerifyError(null);
    setExpiresIn(null);
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  
  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!preferences) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Sign in to manage confirmation preferences</p>
        </CardContent>
      </Card>
    );
  }
  
  const channelOptions: { value: ConfirmChannel; label: string; description: string; icon: typeof Mail }[] = [
    { value: "email", label: "Email Only", description: "Confirmation to your inbox", icon: Mail },
    { value: "sms", label: "SMS Only", description: "Text to your phone", icon: Smartphone },
    { value: "both", label: "Email + SMS", description: "Both channels for maximum assurance", icon: Shield },
    { value: "none", label: "None", description: "No automatic confirmations", icon: X },
  ];
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
            <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <CardTitle>Pick Confirmation Receipts</CardTitle>
            <CardDescription>
              Get proof of your picks with timestamped receipts
            </CardDescription>
          </div>
          <Link 
            to="/me/receipts" 
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View My Receipts
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Success Message */}
        {verifySuccess && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-400">{verifySuccess}</p>
          </div>
        )}
        
        {/* Master Toggle */}
        <div className={cn(
          "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
          preferences.confirm_pick_submission 
            ? "border-primary bg-primary/5" 
            : "border-border"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              preferences.confirm_pick_submission ? "bg-primary/10" : "bg-muted"
            )}>
              <Receipt className={cn(
                "h-5 w-5",
                preferences.confirm_pick_submission ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <p className="font-medium">Automatic Confirmations</p>
              <p className="text-sm text-muted-foreground">
                {preferences.confirm_pick_submission 
                  ? "You'll receive a receipt after each pick submission" 
                  : "Confirmations are disabled"}
              </p>
            </div>
          </div>
          <Switch 
            checked={preferences.confirm_pick_submission} 
            onCheckedChange={(checked) => updatePreference("confirm_pick_submission", checked)}
            disabled={saving}
          />
        </div>
        
        {/* Delivery Channel Selection */}
        {preferences.confirm_pick_submission && (
          <>
            <div className="space-y-3">
              <Label className="text-base">Delivery Channel</Label>
              <div className="grid grid-cols-2 gap-3">
                {channelOptions.map((option) => {
                  const isSelected = preferences.confirm_channel === option.value;
                  const needsVerification = (option.value === "sms" || option.value === "both") && !phoneStatus?.verified;
                  
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleChannelChange(option.value)}
                      disabled={saving}
                      className={cn(
                        "relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left",
                        "hover:border-primary/50 hover:bg-muted/50",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        isSelected 
                          ? "border-primary bg-primary/5" 
                          : "border-border"
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center",
                        isSelected ? "bg-primary/10" : "bg-muted"
                      )}>
                        <option.icon className={cn(
                          "h-4 w-4",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={cn(
                            "text-sm font-medium",
                            isSelected && "text-primary"
                          )}>{option.label}</p>
                          {needsVerification && (
                            <Badge variant="secondary" className="text-[10px]">Verify Phone</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            
            <Separator />
            
            {/* Phone Verification Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Phone Number</Label>
                  <p className="text-sm text-muted-foreground">
                    Required for SMS confirmations
                  </p>
                </div>
                {phoneStatus?.verified && (
                  <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
              
              {/* Current Phone Display */}
              {phoneStatus?.number && verifyMode === "idle" && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono">{phoneStatus.number}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setVerifyMode("entering")}
                  >
                    {phoneStatus.verified ? "Change" : "Verify"}
                  </Button>
                </div>
              )}
              
              {/* Phone Input Mode */}
              {(verifyMode === "entering" || (!phoneStatus?.number && verifyMode === "idle")) && (
                <div className="space-y-3">
                  {verifyError && verifyMode === "entering" && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <p className="text-sm text-red-700 dark:text-red-400">{verifyError}</p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={phoneInput}
                        onChange={handlePhoneInputChange}
                        className="pl-10"
                        maxLength={14}
                      />
                    </div>
                    <Button 
                      onClick={sendVerificationCode}
                      disabled={saving}
                    >
                      Send Code
                    </Button>
                    {phoneStatus?.number && (
                      <Button variant="ghost" onClick={cancelVerification}>
                        Cancel
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    We'll send a 6-digit verification code to this number
                  </p>
                </div>
              )}
              
              {/* OTP Entry Mode */}
              {verifyMode === "sent" && (
                <div className="space-y-3">
                  {verifyError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <p className="text-sm text-red-700 dark:text-red-400">{verifyError}</p>
                    </div>
                  )}
                  
                  <div className="p-4 rounded-lg bg-secondary/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm">
                        Enter the code sent to <span className="font-mono font-medium">{formatPhoneInput(phoneInput)}</span>
                      </p>
                      {expiresIn !== null && expiresIn > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Expires in {formatTime(expiresIn)}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="000000"
                        value={otpInput}
                        onChange={handleOtpInputChange}
                        className="text-center text-2xl font-mono tracking-[0.5em] max-w-[200px]"
                        maxLength={6}
                        autoFocus
                      />
                      <Button 
                        onClick={confirmVerificationCode}
                        disabled={otpInput.length !== 6}
                      >
                        Verify
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <button 
                        onClick={sendVerificationCode}
                        className="text-primary hover:underline flex items-center gap-1"
                        disabled={expiresIn !== null && expiresIn > 540} // Disable for first 60 seconds
                      >
                        <RefreshCw className="h-3 w-3" />
                        Resend code
                      </button>
                      <button 
                        onClick={cancelVerification}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Use different number
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Confirming state */}
              {verifyMode === "confirming" && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </div>
          </>
        )}
        
        {/* Additional Options */}
        {preferences.confirm_pick_submission && (
          <>
            <Separator />
            
            <div className="space-y-4">
              <Label className="text-base">Additional Notifications</Label>
              
              {/* Lock Reminder */}
              <div className={cn(
                "flex items-center justify-between p-3 rounded-xl border transition-all",
                preferences.confirm_pick_lock_reminder ? "border-primary/30 bg-primary/5" : "border-border"
              )}>
                <div className="flex items-center gap-3">
                  <Shield className={cn(
                    "h-4 w-4",
                    preferences.confirm_pick_lock_reminder ? "text-primary" : "text-muted-foreground"
                  )} />
                  <div>
                    <p className="text-sm font-medium">Lock Confirmation</p>
                    <p className="text-xs text-muted-foreground">
                      Get notified when your picks lock for the week
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.confirm_pick_lock_reminder} 
                  onCheckedChange={(checked) => updatePreference("confirm_pick_lock_reminder", checked)}
                  disabled={saving}
                />
              </div>
              
              {/* Weekly Recap */}
              <div className={cn(
                "flex items-center justify-between p-3 rounded-xl border transition-all",
                preferences.weekly_recap_opt_in ? "border-primary/30 bg-primary/5" : "border-border"
              )}>
                <div className="flex items-center gap-3">
                  <Mail className={cn(
                    "h-4 w-4",
                    preferences.weekly_recap_opt_in ? "text-primary" : "text-muted-foreground"
                  )} />
                  <div>
                    <p className="text-sm font-medium">Weekly Results Recap</p>
                    <p className="text-xs text-muted-foreground">
                      Summary of your picks and results each week
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={preferences.weekly_recap_opt_in} 
                  onCheckedChange={(checked) => updatePreference("weekly_recap_opt_in", checked)}
                  disabled={saving}
                />
              </div>
            </div>
          </>
        )}
        
        {/* Info Box */}
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">What are pick receipts?</p>
              <p className="text-xs text-muted-foreground">
                Every time you submit picks, we create a cryptographically signed receipt 
                with an exact timestamp. This provides proof of your picks in case of disputes 
                and ensures the integrity of your pool. You can view all your receipts anytime.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
