import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Users, Crown, Copy } from "lucide-react";

export const Route = createFileRoute("/_app/family")({ component: Family });

function Family() {
  const { profile, isAdmin } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);

  const load = async () => {
    if (!profile?.family_id) return;
    const [m, r, f] = await Promise.all([
      supabase.from("profiles").select("*").eq("family_id", profile.family_id),
      supabase.from("user_roles").select("*").eq("family_id", profile.family_id),
      supabase.from("families").select("*").eq("id", profile.family_id).maybeSingle(),
    ]);
    setMembers(m.data ?? []); setRoles(r.data ?? []); setFamily(f.data);
  };
  useEffect(() => { load(); }, [profile?.family_id]);

  const isAdminUser = (uid: string) => roles.some((r) => r.user_id === uid && r.role === "admin");

  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/auth?mode=signup`);
    toast.success("Invite link copied! Share it with your family member, then ask them to sign up.");
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">{family?.name || "Family"}</h1>
        <p className="text-muted-foreground">Members of your household.</p>
      </header>

      {isAdmin && (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <h2 className="font-display text-lg font-semibold">Invite a family member</h2>
          <p className="mt-1 text-sm text-muted-foreground">Share the sign-up link below. After they create an account, an admin can add them to this family from here (coming soon — for now they can be added by you sharing this group's link).</p>
          <div className="mt-3 flex gap-2">
            <input readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/auth?mode=signup`} className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <button onClick={copyInvite} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}><Copy className="h-4 w-4" /> Copy</button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
            <div className="grid h-12 w-12 place-items-center rounded-2xl text-primary-foreground font-bold" style={{ background: "var(--gradient-warm)" }}>
              {(m.full_name || "?").slice(0,1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-medium">{m.full_name} {isAdminUser(m.id) && <Crown className="h-3.5 w-3.5 text-warning" />}</div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            {isAdminUser(m.id) && <span className="rounded-full bg-warning/30 px-2 py-0.5 text-xs font-semibold">Admin</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
