import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import { Wallet, Users, PieChart, Bell, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Hearth — Family Finance, Together" },
      { name: "description", content: "A warm, simple way for your whole family to track income, expenses, savings, and loans in one shared dashboard." },
    ],
  }),
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  const features = [
    { icon: Users, title: "Built for the whole family", text: "Admins invite members, everyone contributes, all the data lives in one warm home." },
    { icon: PieChart, title: "See the full picture", text: "A shared dashboard with charts, breakdowns, filters and per-member spending." },
    { icon: Wallet, title: "Loans done right", text: "Track principal, interest, payments and remaining tenure — close them when paid." },
    { icon: Bell, title: "Gentle reminders", text: "Stay on top of bill payments and loan dues without the stress." },
    { icon: ShieldCheck, title: "Secure by design", text: "Role-based access, your data stays inside your family group." },
    { icon: Sparkles, title: "Insights & exports", text: "Monthly summaries with one-click PDF and Excel exports." },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
          <span className="grid h-9 w-9 place-items-center rounded-xl text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>♡</span>
          Hearth
        </div>
        <div className="flex items-center gap-2">
          <Link to="/auth" className="rounded-full px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">Sign in</Link>
          <Link to="/auth" search={{ mode: "signup" }} className="rounded-full px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)]" style={{ background: "var(--gradient-warm)" }}>Get started</Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-12 pb-24 text-center">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
          className="font-display text-5xl font-bold leading-[1.05] text-foreground md:text-7xl">
          Family finance,<br />
          <span className="text-primary">warm and simple.</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Track income, expenses, savings, and loans together. Each member has their own profile,
          while the family sees one beautiful, shared picture.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/auth" search={{ mode: "signup" }} className="rounded-full px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)]" style={{ background: "var(--gradient-warm)" }}>
            Create your family
          </Link>
          <Link to="/auth" className="rounded-full border border-border bg-card px-7 py-3.5 text-base font-semibold text-foreground hover:bg-secondary">
            I have an account
          </Link>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
              className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Made with care for families. © {new Date().getFullYear()} Hearth.
      </footer>
    </div>
  );
}
