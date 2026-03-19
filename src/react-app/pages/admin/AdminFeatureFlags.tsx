/**
 * Admin Feature Flags Management
 * Super Admin only - manage global feature flags
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import { Switch } from "@/react-app/components/ui/switch";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Button } from "@/react-app/components/ui/button";
import { Loader2, Flag, Plus, Trash2, AlertTriangle, Globe, Lock } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface FeatureFlag {
  flag_key: string;
  is_enabled: boolean;
  description: string | null;
  updated_at: string;
}

// Known flag descriptions for better UX
const FLAG_DESCRIPTIONS: Record<string, { name: string; description: string; impact: string }> = {
  PUBLIC_POOLS: {
    name: "Public Pool Browsing",
    description: "Allow users to browse and discover public pools",
    impact: "When OFF, pools are invite-only. Users can only join via invite code/link."
  },
  MARKETPLACE_ENABLED: {
    name: "Marketplace Discovery",
    description: "Enable marketplace APIs and pool discovery surfaces",
    impact: "When OFF, marketplace pages and listings are hidden/blocked."
  }
};

const CORE_FLAG_KEYS = ["PUBLIC_POOLS", "MARKETPLACE_ENABLED"] as const;

export function AdminFeatureFlags() {
  const { isDemoMode } = useDemoAuth();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [savingFlags, setSavingFlags] = useState<Set<string>>(new Set());
  
  // New flag form
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newFlagDescription, setNewFlagDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const getHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {};
    if (isDemoMode) headers["X-Demo-Mode"] = "true";
    return headers;
  }, [isDemoMode]);

  const fetchPublicFlags = useCallback(async (): Promise<FeatureFlag[]> => {
    const publicRes = await fetch("/api/feature-flags/public");
    if (!publicRes.ok) return [];
    const publicData = await publicRes.json() as Record<string, boolean | undefined>;
    return CORE_FLAG_KEYS.map((flagKey) => ({
      flag_key: flagKey,
      is_enabled: Boolean(publicData[flagKey]),
      description: FLAG_DESCRIPTIONS[flagKey]?.description ?? "Public feature flag",
      updated_at: new Date().toISOString(),
    }));
  }, []);

  const fetchFlags = useCallback(async () => {
    try {
      setError(null);
      setIsReadOnly(false);
      const response = await fetch("/api/admin/settings", {
        headers: getHeaders(),
        credentials: "include"
      });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Graceful fallback: show public flags in read-only mode.
          const publicFlags = await fetchPublicFlags();
          if (publicFlags.length === 0) {
            throw new Error("Failed to load feature flags. Please sign in as Super Admin.");
          }
          setFlags(publicFlags);
          setIsReadOnly(true);
          setError("Read-only view: sign in as Super Admin to edit feature flags.");
          return;
        }
        throw new Error("Failed to fetch feature flags");
      }
      
      const data = await response.json() as {
        featureFlags?: Array<{
          flag_key?: string;
          is_enabled?: boolean | number;
          description?: string | null;
          updated_at?: string;
        }>;
      };
      const mapped = (data.featureFlags || [])
        .filter((row) => typeof row.flag_key === "string")
        .map((row) => ({
          flag_key: String(row.flag_key),
          is_enabled: row.is_enabled === true || row.is_enabled === 1,
          description: row.description ?? null,
          updated_at: row.updated_at || new Date().toISOString(),
        }));
      if (mapped.length > 0) {
        setFlags(mapped);
      } else {
        // In some local/demo setups admin settings can return empty flags.
        // Hydrate core flags from public endpoint so toggles remain visible.
        const publicFlags = await fetchPublicFlags();
        setFlags(publicFlags);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [fetchPublicFlags, getHeaders]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const handleToggle = async (flagKey: string, newValue: boolean) => {
    if (isReadOnly) return;
    setSavingFlags(prev => new Set(prev).add(flagKey));
    
    try {
      const response = await fetch(`/api/admin/feature-flags/${encodeURIComponent(flagKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        credentials: "include",
        body: JSON.stringify({
          is_enabled: newValue
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to update flag");
      }
      
      // Update local state
      setFlags(prev => prev.map(f => 
        f.flag_key === flagKey ? { ...f, is_enabled: newValue } : f
      ));
    } catch (err) {
      console.error("Failed to toggle flag:", err);
      // Optionally show toast error
    } finally {
      setSavingFlags(prev => {
        const next = new Set(prev);
        next.delete(flagKey);
        return next;
      });
    }
  };

  const handleCreate = async () => {
    if (isReadOnly) return;
    if (!newFlagKey.trim()) return;
    
    setIsCreating(true);
    
    try {
      const normalizedKey = newFlagKey.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      const response = await fetch(`/api/admin/feature-flags/${encodeURIComponent(normalizedKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        credentials: "include",
        body: JSON.stringify({
          is_enabled: false,
          description: newFlagDescription || null
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create flag");
      }
      
      // Refresh flags list
      await fetchFlags();
      
      // Clear form
      setNewFlagKey("");
      setNewFlagDescription("");
    } catch (err) {
      console.error("Failed to create flag:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (flagKey: string) => {
    if (isReadOnly) return;
    if (!confirm(`Delete feature flag "${flagKey}"? This cannot be undone.`)) {
      return;
    }
    
    setSavingFlags(prev => new Set(prev).add(flagKey));
    
    try {
      const response = await fetch(`/api/feature-flags/${encodeURIComponent(flagKey)}`, {
        method: "DELETE",
        headers: getHeaders(),
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete flag");
      }
      
      // Remove from local state
      setFlags(prev => prev.filter(f => f.flag_key !== flagKey));
    } catch (err) {
      console.error("Failed to delete flag:", err);
    } finally {
      setSavingFlags(prev => {
        const next = new Set(prev);
        next.delete(flagKey);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !isReadOnly) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <span>Failed to load feature flags: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Flag className="w-6 h-6" />
          Feature Flags
        </h1>
        <p className="text-muted-foreground mt-1">
          Control global feature availability across the platform
        </p>
      </div>

      {/* Warning Banner */}
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600 dark:text-amber-400">
                Changes take effect immediately
              </p>
              <p className="text-muted-foreground">
                Feature flag changes are applied platform-wide without requiring a deploy.
                Use caution when toggling production flags.
              </p>
              {error && (
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  {error}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flags List */}
      <div className="space-y-4">
        {flags.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Flag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No feature flags configured</p>
            </CardContent>
          </Card>
        ) : (
          flags.map(flag => {
            const knownFlag = FLAG_DESCRIPTIONS[flag.flag_key];
            const isSaving = savingFlags.has(flag.flag_key);
            
            return (
              <Card key={flag.flag_key} className={cn(
                "transition-all",
                flag.is_enabled ? "border-green-500/30" : "border-muted"
              )}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {flag.is_enabled ? (
                          <Globe className="w-4 h-4 text-green-500" />
                        ) : (
                          <Lock className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="font-mono font-medium">
                          {flag.flag_key}
                        </span>
                        <Badge 
                          variant={flag.is_enabled ? "default" : "secondary"}
                          className={cn(
                            "text-xs",
                            flag.is_enabled && "bg-green-500"
                          )}
                        >
                          {flag.is_enabled ? "ON" : "OFF"}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-muted-foreground">
                        {knownFlag?.description || flag.description || "No description"}
                      </p>
                      
                      {knownFlag?.impact && (
                        <p className="text-xs text-muted-foreground/70 mt-1 italic">
                          {knownFlag.impact}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Switch
                          checked={flag.is_enabled}
                          onCheckedChange={(checked) => handleToggle(flag.flag_key, checked)}
                          disabled={isReadOnly}
                        />
                      )}
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(flag.flag_key)}
                        disabled={isSaving || isReadOnly}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create New Flag */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create New Flag
          </CardTitle>
          <CardDescription>
            Add a new feature flag for controlling functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="flag-key">Flag Key</Label>
              <Input
                id="flag-key"
                placeholder="MY_FEATURE_FLAG"
                value={newFlagKey}
                onChange={(e) => setNewFlagKey(e.target.value.toUpperCase())}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use SCREAMING_SNAKE_CASE
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="flag-description">Description</Label>
              <Input
                id="flag-description"
                placeholder="What does this flag control?"
                value={newFlagDescription}
                onChange={(e) => setNewFlagDescription(e.target.value)}
              />
            </div>
          </div>
          
          <Button 
            onClick={handleCreate}
            disabled={!newFlagKey.trim() || isCreating || isReadOnly}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Flag
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
