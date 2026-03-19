import { useEffect, useState } from "react";

type SystemConfig = Record<string, unknown>;

export default function AdminSystem() {
  const [config, setConfig] = useState<SystemConfig>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/coachg/admin/system", { credentials: "include" });
        const payload = await res.json();
        if (!cancelled) setConfig(payload?.config || {});
      } catch {
        if (!cancelled) setMessage("Unable to load system settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/coachg/admin/system", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage("System configuration saved.");
    } catch {
      setMessage("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin System Controls</h1>
        <p className="text-sm text-white/60">
          Configure model routing, edge profile, sharp sensitivity, and task engine toggles.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase text-white/60">Model Routing</p>
          <input
            value={String(config.modelRoutingMode || "")}
            onChange={(e) => updateField("modelRoutingMode", e.target.value)}
            className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase text-white/60">Edge Weights Profile</p>
          <input
            value={String(config.edgeWeightsProfile || "")}
            onChange={(e) => updateField("edgeWeightsProfile", e.target.value)}
            className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase text-white/60">Sharp Sensitivity</p>
          <input
            value={String(config.sharpRadarSensitivity || "")}
            onChange={(e) => updateField("sharpRadarSensitivity", e.target.value)}
            className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase text-white/60">Task Engine Enabled</p>
          <select
            value={String(config.taskEngineEnabled ?? "true")}
            onChange={(e) => updateField("taskEngineEnabled", e.target.value)}
            className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save System Settings"}
      </button>
      {message && <p className="text-sm text-white/70">{message}</p>}
    </div>
  );
}
