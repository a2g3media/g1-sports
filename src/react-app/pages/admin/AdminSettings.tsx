import { useEffect, useState, useCallback } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Switch } from "@/react-app/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/react-app/components/ui/dialog";
import {
  Loader2,
  Settings,
  Flag,
  Plus,
  Pencil,
  Save,
  RefreshCw,
  ToggleLeft,
  Database,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface PlatformSetting {
  id: number;
  setting_key: string;
  setting_value: string | null;
  setting_type: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface FeatureFlag {
  id: number;
  flag_key: string;
  is_enabled: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface SettingsData {
  settings: PlatformSetting[];
  featureFlags: FeatureFlag[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AdminSettings() {
  const { isDemoMode } = useDemoAuth();
  const [data, setData] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState<string | null>(null);

  // Edit setting dialog
  const [editingSetting, setEditingSetting] = useState<PlatformSetting | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // New setting dialog
  const [showNewSetting, setShowNewSetting] = useState(false);
  const [newSettingKey, setNewSettingKey] = useState("");
  const [newSettingValue, setNewSettingValue] = useState("");
  const [newSettingDescription, setNewSettingDescription] = useState("");

  // New flag dialog
  const [showNewFlag, setShowNewFlag] = useState(false);
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newFlagEnabled, setNewFlagEnabled] = useState(false);
  const [newFlagDescription, setNewFlagDescription] = useState("");

  const getHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {};
    if (isDemoMode) {
      headers["X-Demo-Mode"] = "true";
    }
    return headers;
  }, [isDemoMode]);

  const fetchData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setIsRefreshing(true);
      else setIsLoading(true);

      const response = await fetch("/api/admin/settings", {
        credentials: "include",
        headers: getHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateSetting = async (key: string, value: string, description?: string) => {
    try {
      setIsSaving(key);
      const response = await fetch(`/api/admin/settings/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        credentials: "include",
        body: JSON.stringify({ value, description }),
      });

      if (response.ok) {
        await fetchData(true);
        setEditingSetting(null);
      }
    } catch (error) {
      console.error("Failed to update setting:", error);
    } finally {
      setIsSaving(null);
    }
  };

  const toggleFlag = async (key: string, isEnabled: boolean) => {
    try {
      setIsSaving(key);
      const response = await fetch(`/api/admin/feature-flags/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        credentials: "include",
        body: JSON.stringify({ is_enabled: isEnabled }),
      });

      if (response.ok) {
        await fetchData(true);
      }
    } catch (error) {
      console.error("Failed to toggle flag:", error);
    } finally {
      setIsSaving(null);
    }
  };

  const createSetting = async () => {
    if (!newSettingKey.trim()) return;

    try {
      setIsSaving("new-setting");
      await updateSetting(newSettingKey.trim(), newSettingValue, newSettingDescription || undefined);
      setShowNewSetting(false);
      setNewSettingKey("");
      setNewSettingValue("");
      setNewSettingDescription("");
    } finally {
      setIsSaving(null);
    }
  };

  const createFlag = async () => {
    if (!newFlagKey.trim()) return;

    try {
      setIsSaving("new-flag");
      const response = await fetch(`/api/admin/feature-flags/${encodeURIComponent(newFlagKey.trim())}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        credentials: "include",
        body: JSON.stringify({ 
          is_enabled: newFlagEnabled,
          description: newFlagDescription || undefined 
        }),
      });

      if (response.ok) {
        await fetchData(true);
        setShowNewFlag(false);
        setNewFlagKey("");
        setNewFlagEnabled(false);
        setNewFlagDescription("");
      }
    } catch (error) {
      console.error("Failed to create flag:", error);
    } finally {
      setIsSaving(null);
    }
  };

  const openEditDialog = (setting: PlatformSetting) => {
    setEditingSetting(setting);
    setEditValue(setting.setting_value || "");
    setEditDescription(setting.description || "");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Settings"
        description="Platform configuration and feature flags"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="h-8"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Platform Settings Section */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Platform Settings</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNewSetting(true)}
              className="h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Setting
            </Button>
          </div>

          {!data?.settings || data.settings.length === 0 ? (
            <div className="p-8 text-center">
              <Settings className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No settings configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add platform settings to configure app behavior.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.settings.map((setting) => (
                <div
                  key={setting.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-medium">
                        {setting.setting_key}
                      </code>
                      <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        {setting.setting_type || "string"}
                      </span>
                    </div>
                    {setting.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                        {setting.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 ml-4">
                    <div className="text-right">
                      <p className="text-sm font-medium truncate max-w-[200px]">
                        {setting.setting_value || <span className="text-muted-foreground italic">empty</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated {formatDate(setting.updated_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(setting)}
                      className="h-8 w-8 p-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Feature Flags Section */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Feature Flags</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNewFlag(true)}
              className="h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Flag
            </Button>
          </div>

          {!data?.featureFlags || data.featureFlags.length === 0 ? (
            <div className="p-8 text-center">
              <ToggleLeft className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No feature flags configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add feature flags to control feature rollouts.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.featureFlags.map((flag) => (
                <div
                  key={flag.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-medium">
                        {flag.flag_key}
                      </code>
                      <span
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded font-medium",
                          flag.is_enabled
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-slate-500/10 text-slate-600 dark:text-slate-400"
                        )}
                      >
                        {flag.is_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    {flag.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                        {flag.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 ml-4">
                    <p className="text-xs text-muted-foreground">
                      Updated {formatDate(flag.updated_at)}
                    </p>
                    <Switch
                      checked={flag.is_enabled === 1}
                      onCheckedChange={(checked) => toggleFlag(flag.flag_key, checked)}
                      disabled={isSaving === flag.flag_key}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Setting Dialog */}
      <Dialog open={!!editingSetting} onOpenChange={() => setEditingSetting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Edit Setting
            </DialogTitle>
          </DialogHeader>

          {editingSetting && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Setting Key</Label>
                <code className="block text-sm font-mono bg-secondary px-3 py-2 rounded-lg">
                  {editingSetting.setting_key}
                </code>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-value">Value</Label>
                <Input
                  id="edit-value"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Enter value..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional description..."
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSetting(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => editingSetting && updateSetting(editingSetting.setting_key, editValue, editDescription)}
              disabled={isSaving === editingSetting?.setting_key}
            >
              {isSaving === editingSetting?.setting_key ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Setting Dialog */}
      <Dialog open={showNewSetting} onOpenChange={setShowNewSetting}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Platform Setting
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-setting-key">Setting Key</Label>
              <Input
                id="new-setting-key"
                value={newSettingKey}
                onChange={(e) => setNewSettingKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                placeholder="SETTING_KEY"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use SCREAMING_SNAKE_CASE for consistency.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-setting-value">Value</Label>
              <Input
                id="new-setting-value"
                value={newSettingValue}
                onChange={(e) => setNewSettingValue(e.target.value)}
                placeholder="Enter value..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-setting-description">Description</Label>
              <Input
                id="new-setting-description"
                value={newSettingDescription}
                onChange={(e) => setNewSettingDescription(e.target.value)}
                placeholder="What does this setting control?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSetting(false)}>
              Cancel
            </Button>
            <Button
              onClick={createSetting}
              disabled={!newSettingKey.trim() || isSaving === "new-setting"}
            >
              {isSaving === "new-setting" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Setting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Flag Dialog */}
      <Dialog open={showNewFlag} onOpenChange={setShowNewFlag}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Add Feature Flag
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-flag-key">Flag Key</Label>
              <Input
                id="new-flag-key"
                value={newFlagKey}
                onChange={(e) => setNewFlagKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="feature_name"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use snake_case for consistency.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
              <div>
                <p className="text-sm font-medium">Initially Enabled</p>
                <p className="text-xs text-muted-foreground">
                  Turn on by default when created
                </p>
              </div>
              <Switch
                checked={newFlagEnabled}
                onCheckedChange={setNewFlagEnabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-flag-description">Description</Label>
              <Input
                id="new-flag-description"
                value={newFlagDescription}
                onChange={(e) => setNewFlagDescription(e.target.value)}
                placeholder="What does this flag control?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFlag(false)}>
              Cancel
            </Button>
            <Button
              onClick={createFlag}
              disabled={!newFlagKey.trim() || isSaving === "new-flag"}
            >
              {isSaving === "new-flag" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
