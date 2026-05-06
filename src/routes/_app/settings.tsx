import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Bell, Save } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

function Settings() {
  const { profile, user, refresh } = useAuth();
  const [bills, setBills] = useState(true);
  const [loans, setLoans] = useState(true);
  const [days, setDays] = useState(7);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setBills(profile.notify_bills !== false);
    setLoans(profile.notify_loans !== false);
    setDays(profile.notify_days_ahead ?? 7);
  }, [profile?.id]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ notify_bills: bills, notify_loans: loans, notify_days_ahead: days })
      .eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Notification preferences saved");
    await refresh();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Personal preferences for your account.</p>
      </header>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-semibold">Notifications</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Choose which reminders you want to receive in the notification panel.</p>

        <div className="space-y-4">
          <Toggle label="Bill reminders" description="Get notified about upcoming bill payments." value={bills} onChange={setBills} />
          <Toggle label="Loan due notifications" description="Get notified about upcoming loan interest dues." value={loans} onChange={setLoans} />

          <label className="block pt-2">
            <span className="mb-1 block text-sm font-medium">Notify me this many days in advance</span>
            <input
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(60, parseInt(e.target.value || "7", 10))))}
              className="w-32 rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <span className="ml-2 text-sm text-muted-foreground">day{days === 1 ? "" : "s"}</span>
          </label>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save preferences"}
        </button>
      </section>
    </div>
  );
}

function Toggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-secondary/40 p-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-muted-foreground/30"}`}
        aria-pressed={value}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}