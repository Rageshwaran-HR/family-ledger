import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Bell, Save, User, Lock, Check } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

function Settings() {
  const { profile, user, refresh } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [bills, setBills] = useState(true);
  const [loans, setLoans] = useState(true);
  const [days, setDays] = useState(7);
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setBills(profile.notify_bills !== false);
    setLoans(profile.notify_loans !== false);
    setDays(profile.notify_days_ahead ?? 7);
  }, [profile?.id]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile name updated");
    await refresh();
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const saveNotif = async () => {
    if (!user) return;
    setSavingNotif(true);
    const { error } = await supabase
      .from("profiles")
      .update({ notify_bills: bills, notify_loans: loans, notify_days_ahead: days })
      .eq("id", user.id);
    setSavingNotif(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Notification preferences saved");
    await refresh();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your personal profile, security and preferences.</p>
      </header>

      {/* Profile Info */}
      <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-semibold">Profile information</h2>
        </div>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Email address</label>
            <input
              type="email"
              disabled
              value={user?.email ?? ""}
              className="w-full rounded-xl border border-border bg-secondary/60 px-3.5 py-2.5 text-sm text-muted-foreground cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Full display name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              required
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-warm)" }}
          >
            <Save className="h-4 w-4" /> {savingProfile ? "Saving…" : "Update profile"}
          </button>
        </form>
      </section>

      {/* Password change */}
      <section className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg sm:text-xl font-semibold">Security & password</h2>
        </div>
        <form onSubmit={savePassword} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                minLength={6}
                required
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                minLength={6}
                required
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingPassword || !newPassword}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-warm)" }}
          >
            <Check className="h-4 w-4" /> {savingPassword ? "Updating…" : "Change password"}
          </button>
        </form>
      </section>

      {/* Notification preferences */}
      <section className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg sm:text-xl font-semibold">Notifications</h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mb-5">Choose which reminders you want to receive in the notification panel.</p>

        <div className="space-y-4">
          <Toggle label="Bill reminders" description="Get notified about upcoming bill payments." value={bills} onChange={setBills} />
          <Toggle label="Loan due notifications" description="Get notified about upcoming loan interest dues." value={loans} onChange={setLoans} />

          <label className="block pt-2">
            <span className="mb-1 block text-xs sm:text-sm font-medium">Notify me this many days in advance</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={60}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(60, parseInt(e.target.value || "7", 10))))}
                className="w-28 rounded-xl border border-input bg-background px-3.5 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
              <span className="text-xs sm:text-sm text-muted-foreground">day{days === 1 ? "" : "s"}</span>
            </div>
          </label>
        </div>

        <button
          onClick={saveNotif}
          disabled={savingNotif}
          className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Save className="h-4 w-4" /> {savingNotif ? "Saving…" : "Save preferences"}
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