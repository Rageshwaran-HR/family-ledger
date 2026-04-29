import { createFileRoute, Outlet, Link, useRouterState, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, ArrowLeftRight, Wallet, Tag, Users, Bell, FileBarChart, LogOut, Menu, X, Heart } from "lucide-react";
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

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => { setOpen(false); }, [path]);

  // Family bootstrap fallback for users who confirmed via email link
  useEffect(() => {
    if (user && profile && !profile.family_id) {
      navigate({ to: "/onboarding" });
    }
  }, [user, profile, navigate]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <Link to="/dashboard" className="flex items-center gap-2 font-display text-xl font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>♡</span>
          Hearth
        </Link>
        <button onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-secondary">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
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
        <motion.div key={path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
          className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
