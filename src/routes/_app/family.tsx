import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Crown, Copy, Mail, Trash2, Plus, Check, Clock, XCircle, ShieldAlert, UserMinus } from "lucide-react";

export const Route = createFileRoute("/_app/family")({ component: Family });

function Family() {
  const { profile, isAdmin, user, refresh } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [shownLink, setShownLink] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  // Tick every minute for countdown
  useEffect(() => {
    const i = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(i);
  }, []);

  const load = async () => {
    if (!profile?.family_id) return;
    const [m, r, f, i] = await Promise.all([
      supabase.from("profiles").select("*").eq("family_id", profile.family_id),
      supabase.from("user_roles").select("*").eq("family_id", profile.family_id),
      supabase.from("families").select("*").eq("id", profile.family_id).maybeSingle(),
      supabase.from("family_invitations").select("*").eq("family_id", profile.family_id).order("created_at", { ascending: false }),
    ]);
    setMembers(m.data ?? []);
    setRoles(r.data ?? []);
    setFamily(f.data);
    setInvites(i.data ?? []);
  };
  useEffect(() => { load(); }, [profile?.family_id]);

  const isAdminUser = (uid: string) => roles.some((r) => r.user_id === uid && r.role === "admin");
  const getUserRole = (uid: string): "admin" | "member" =>
    roles.find((r) => r.user_id === uid)?.role ?? "member";

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
      const link = inviteLink(data.token);
      setShownLink(link);
      try {
        await navigator.clipboard.writeText(link);
        toast.success("Invite link created and copied to clipboard");
      } catch {
        toast.success("Invite link created — copy it from the box below");
      }
    }
  };

  const copyInviteLink = async (id: string, token: string) => {
    const link = inviteLink(token);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
      toast.success("Invite link copied!");
    } catch {
      setShownLink(link);
      toast.message("Clipboard blocked — copy from the box below");
    }
  };

  const revokeInvite = async (id: string) => {
    if (!confirm("Revoke this invitation?")) return;
    const { error } = await supabase.from("family_invitations").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Revoked"); load(); }
  };

  const changeRole = async (targetUserId: string, newRole: "admin" | "member") => {
    if (!isAdmin) return;
    const { error } = await supabase.rpc("update_member_role", {
      _member_user_id: targetUserId,
      _new_role: newRole,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Role updated to ${newRole}`);
      await load();
      await refresh();
    }
  };

  const removeMember = async (targetUserId: string, name: string) => {
    if (!confirm(`Remove ${name} from this family group?`)) return;
    const { error } = await supabase.rpc("remove_family_member", {
      _member_user_id: targetUserId,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${name} has been removed`);
      await load();
    }
  };

  const countdown = (expiresAt: string): string => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "expired";
    const mins = Math.floor(ms / 60_000);
    const days = Math.floor(mins / (60 * 24));
    const hours = Math.floor((mins % (60 * 24)) / 60);
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${mins % 60}m left`;
    return `${mins}m left`;
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

          {shownLink && (
            <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-1.5">Share this link with your family member</div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shownLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono"
                />
                <button
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(shownLink); toast.success("Copied!"); } catch { toast.error("Select the text and press Ctrl/Cmd + C"); }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
                <button onClick={() => setShownLink(null)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"><XCircle className="h-4 w-4" /></button>
              </div>
            </div>
          )}

          {invites.length > 0 && (
            <div className="mt-5 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending invitations</h3>
              {invites.map((inv) => {
                const expired = new Date(inv.expires_at) < new Date();
                const used = !!inv.accepted_at;
                const status: "accepted" | "expired" | "pending" = used ? "accepted" : expired ? "expired" : "pending";
                return (
                  <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-border bg-secondary/50 p-3.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium truncate">{inv.email || "Open invite link"}</span>
                        {status === "accepted" && <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-semibold text-success"><Check className="h-3 w-3" /> Accepted</span>}
                        {status === "expired" && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold"><XCircle className="h-3 w-3" /> Expired</span>}
                        {status === "pending" && <span className="inline-flex items-center gap-1 rounded-full bg-warning/30 px-2 py-0.5 text-[11px] font-semibold"><Clock className="h-3 w-3" /> Pending</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {status === "accepted"
                          ? <>Accepted {new Date(inv.accepted_at).toLocaleDateString()}</>
                          : <>Expires {new Date(inv.expires_at).toLocaleDateString()} · <span className={status === "expired" ? "text-destructive" : ""}>{countdown(inv.expires_at)}</span></>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/50">
                      {status === "pending" && (
                        <>
                          <button onClick={() => copyInviteLink(inv.id, inv.token)} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-full bg-card border border-border px-3 py-1.5 text-xs font-semibold hover:bg-background">
                            {copiedId === inv.id ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy link</>}
                          </button>
                          <button onClick={() => setShownLink(inviteLink(inv.token))} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-full bg-card border border-border px-3 py-1.5 text-xs font-semibold hover:bg-background">
                            Show
                          </button>
                        </>
                      )}
                      <button onClick={() => revokeInvite(inv.id)} title="Revoke" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => {
          const userIsAdmin = isAdminUser(m.id);
          const currentRole = getUserRole(m.id);
          const isSelf = m.id === user?.id;

          return (
            <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-primary-foreground font-bold" style={{ background: "var(--gradient-warm)" }}>
                  {(m.full_name || "?").slice(0,1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium truncate">
                    {m.full_name} {userIsAdmin && <Crown className="h-3.5 w-3.5 text-warning shrink-0" />}
                    {isSelf && <span className="text-xs text-muted-foreground">(You)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 pl-14 sm:pl-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                {isAdmin && !isSelf ? (
                  <>
                    <select
                      value={currentRole}
                      onChange={(e) => changeRole(m.id, e.target.value as "admin" | "member")}
                      className="rounded-full border border-border bg-secondary/70 px-3 py-1 text-xs font-semibold outline-none"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => removeMember(m.id, m.full_name || "this member")}
                      title="Remove from family"
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  userIsAdmin && <span className="rounded-full bg-warning/30 px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">Admin</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
