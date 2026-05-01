import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Crown, Copy, Mail, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/family")({ component: Family });

function Family() {
  const { profile, isAdmin, user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!profile?.family_id) return;
    const [m, r, f, i] = await Promise.all([
      supabase.from("profiles").select("*").eq("family_id", profile.family_id),
      supabase.from("user_roles").select("*").eq("family_id", profile.family_id),
      supabase.from("families").select("*").eq("id", profile.family_id).maybeSingle(),
      supabase.from("family_invitations").select("*").eq("family_id", profile.family_id).order("created_at", { ascending: false }),
    ]);
    setMembers(m.data ?? []); setRoles(r.data ?? []); setFamily(f.data);
    setInvites(i.data ?? []);
  };
  useEffect(() => { load(); }, [profile?.family_id]);

  const isAdminUser = (uid: string) => roles.some((r) => r.user_id === uid && r.role === "admin");

  const inviteLink = (token: string) => `${window.location.origin}/auth?mode=signup&token=${token}`;

  const createInvite = async () => {
    if (!profile?.family_id || !user) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("family_invitations")
      .insert({ family_id: profile.family_id, invited_by: user.id, email: inviteEmail || null })
      .select()
      .single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    setInviteEmail("");
    await load();
    if (data?.token) {
      navigator.clipboard.writeText(inviteLink(data.token)).catch(() => {});
      toast.success("Invite created and link copied!");
    }
  };

  const copyInviteLink = (token: string) => {
    navigator.clipboard.writeText(inviteLink(token));
    toast.success("Invite link copied!");
  };

  const revokeInvite = async (id: string) => {
    if (!confirm("Revoke this invitation?")) return;
    const { error } = await supabase.from("family_invitations").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Revoked"); load(); }
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
          <p className="mt-1 text-sm text-muted-foreground">Generate a secure invitation link. They'll automatically join your family when they sign up.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email (optional, for your reference)"
                className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={createInvite}
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-warm)" }}
            >
              <Plus className="h-4 w-4" /> {creating ? "Creating…" : "Generate invite link"}
            </button>
          </div>

          {invites.length > 0 && (
            <div className="mt-5 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending invitations</h3>
              {invites.map((inv) => {
                const expired = new Date(inv.expires_at) < new Date();
                const used = !!inv.accepted_at;
                return (
                  <div key={inv.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-secondary/50 p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{inv.email || "No email"}</span>
                        {used && <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-semibold text-success">Used</span>}
                        {expired && !used && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">Expired</span>}
                        {!used && !expired && <span className="rounded-full bg-warning/30 px-2 py-0.5 text-xs font-semibold">Pending</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">Expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                    </div>
                    {!used && !expired && (
                      <button onClick={() => copyInviteLink(inv.token)} className="inline-flex items-center gap-1 rounded-full bg-card border border-border px-3 py-1.5 text-xs font-semibold hover:bg-background">
                        <Copy className="h-3 w-3" /> Copy link
                      </button>
                    )}
                    <button onClick={() => revokeInvite(inv.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
