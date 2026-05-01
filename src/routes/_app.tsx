import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDate } from "@/lib/format";
import { LayoutDashboard, ArrowLeftRight, Wallet, Tag, Users, Bell, FileBarChart, LogOut, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/loans", label: "Loans", icon: Heart },
  { to: "/tags", label: "Tags", icon: Tag },
  { to: "/reminders", label: "Reminders", icon: Bell },
  { to: "/family", label: "Family", icon: Users },
  { to: "/reports", label: "Reports", icon: FileBarChart },
] as const;

function AppShell() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; due: string; amount: number | null; overdue: boolean; kind: "reminder" | "loan" }>>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { mode: "signin" } });
  }, [user, loading, navigate]);

  useEffect(() => { setOpen(false); }, [path]);

  // Family bootstrap fallback for users who confirmed via email link
  useEffect(() => {
    if (user && profile && !profile.family_id) {
      navigate({ to: "/onboarding" });
    }
  }, [user, profile, navigate]);

  // Load upcoming notifications (reminders + loan dues within 7 days)
  useEffect(() => {
    if (!profile?.family_id) return;
    let cancelled = false;
    const loadNotifs = async () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const horizon = new Date(today); horizon.setDate(horizon.getDate() + 7);
      const horizonISO = horizon.toISOString().slice(0,10);

      const [{ data: reminders }, { data: loans }] = await Promise.all([
        supabase.from("reminders").select("id,title,due_date,amount,is_paid").eq("is_paid", false).lte("due_date", horizonISO),
        supabase.from("loans").select("id,name,start_date,interest_rate_monthly,remaining_balance,status").eq("status", "active"),
      ]);

      const items: typeof notifications = [];
      (reminders || []).forEach((r: any) => {
        const due = new Date(r.due_date);
        items.push({ id: `r-${r.id}`, title: r.title, due: r.due_date, amount: r.amount ? Number(r.amount) : null, overdue: due < today, kind: "reminder" });
      });
      // For loans, surface upcoming monthly due (next due = start_date + N months from start)
      (loans || []).forEach((l: any) => {
        const start = new Date(l.start_date);
        const monthsElapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000*60*60*24*30)));
        const next = new Date(start); next.setMonth(start.getMonth() + monthsElapsed + 1);
        if (next <= horizon && Number(l.remaining_balance) > 0) {
          const interest = Number(l.remaining_balance) * (Number(l.interest_rate_monthly) / 100);
          items.push({ id: `l-${l.id}`, title: `${l.name} — interest due`, due: next.toISOString().slice(0,10), amount: interest, overdue: next < today, kind: "loan" });
        }
      });
      items.sort((a,b) => a.due.localeCompare(b.due));
      if (!cancelled) setNotifications(items);
    };
    loadNotifs();
    const interval = setInterval(loadNotifs, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [profile?.family_id]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }

  const unreadCount = notifications.length;

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <Link to="/dashboard" className="flex items-center gap-2 font-display text-xl font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>♡</span>
          Hearth
        </Link>
        <div className="flex items-center gap-1">
          <NotifBell count={unreadCount} onClick={() => setNotifOpen(true)} />
          <button onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-secondary">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        {(open || true) && (
          <aside className={`${open ? "block" : "hidden"} md:block fixed inset-x-0 top-[57px] z-20 md:static md:top-0 md:w-64 md:flex-shrink-0`}>
            <div className="flex h-full flex-col gap-1 border-r border-border bg-sidebar p-4 md:h-screen md:sticky md:top-0">
              <Link to="/dashboard" className="mb-4 hidden items-center gap-2 px-2 font-display text-2xl font-bold md:flex">
                <span className="grid h-9 w-9 place-items-center rounded-xl text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>♡</span>
                Hearth
              </Link>
              <nav className="flex flex-col gap-1">
                {nav.map((item) => {
                  const active = path.startsWith(item.to);
                  return (
                    <Link key={item.to} to={item.to}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        active ? "bg-primary text-primary-foreground shadow-[var(--shadow-soft)]" : "text-foreground hover:bg-sidebar-accent"
                      }`}>
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-auto border-t border-border pt-3">
                <div className="px-3 py-2">
                  <div className="text-sm font-semibold text-foreground">{profile?.full_name || "You"}</div>
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                </div>
                <button onClick={() => { signOut(); navigate({ to: "/" }); }}
                  className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-sidebar-accent">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          </aside>
        )}
      </AnimatePresence>

      <main className="flex-1 min-w-0">
        {/* Desktop top bar */}
        <div className="hidden md:flex items-center justify-end gap-2 border-b border-border bg-card/50 px-8 py-3">
          <NotifBell count={unreadCount} onClick={() => setNotifOpen(true)} />
        </div>
        <motion.div key={path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
          className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </motion.div>
      </main>

      <AnimatePresence>
        {notifOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40" onClick={() => setNotifOpen(false)}>
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween" }}
              onClick={(e) => e.stopPropagation()}
              className="ml-auto h-full w-full max-w-sm border-l border-border bg-card p-5 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-bold">Notifications</h2>
                <button onClick={() => setNotifOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
              {notifications.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">All caught up! 🌿<br />No upcoming bills or dues.</p>
              ) : (
                <ul className="space-y-2">
                  {notifications.map((n) => (
                    <li key={n.id} className={`rounded-2xl border p-3 ${n.overdue ? "border-destructive/30 bg-destructive/5" : "border-border bg-secondary/50"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{n.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {n.kind === "loan" ? "Loan due" : "Bill"} · {formatDate(n.due)}
                            {n.overdue && <span className="text-destructive font-medium"> · overdue</span>}
                          </div>
                        </div>
                        {n.amount != null && <div className="text-sm font-semibold whitespace-nowrap">{formatMoney(n.amount)}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 border-t border-border pt-3">
                <Link to="/reminders" onClick={() => setNotifOpen(false)} className="block rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground">View all reminders</Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotifBell({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-secondary" aria-label="Notifications">
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
