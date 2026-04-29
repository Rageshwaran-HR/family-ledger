import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, Plus } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

interface Tx { id: string; amount: number; type: "income" | "expense"; occurred_on: string; user_id: string; tag_id: string | null; }
interface Tag { id: string; name: string; color: string; }
interface Profile { id: string; full_name: string; }

function Dashboard() {
  const { profile } = useAuth();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [period, setPeriod] = useState<"month" | "year" | "all">("month");
  const [memberFilter, setMemberFilter] = useState<string>("all");

  useEffect(() => {
    if (!profile?.family_id) return;
    (async () => {
      const [t, g, m] = await Promise.all([
        supabase.from("transactions").select("*").order("occurred_on", { ascending: false }),
        supabase.from("tags").select("id,name,color"),
        supabase.from("profiles").select("id,full_name").eq("family_id", profile.family_id),
      ]);
      setTxs((t.data as Tx[]) ?? []);
      setTags((g.data as Tag[]) ?? []);
      setMembers((m.data as Profile[]) ?? []);
    })();
  }, [profile?.family_id]);

  const filtered = useMemo(() => {
    const now = new Date();
    return txs.filter((t) => {
      if (memberFilter !== "all" && t.user_id !== memberFilter) return false;
      const d = new Date(t.occurred_on);
      if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === "year") return d.getFullYear() === now.getFullYear();
      return true;
    });
  }, [txs, period, memberFilter]);

  const totalIncome = filtered.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const net = totalIncome - totalExpense;

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));

  const byTag = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.filter((t) => t.type === "expense").forEach((t) => {
      const k = t.tag_id ? tagMap[t.tag_id]?.name ?? "Other" : "Untagged";
      m[k] = (m[k] || 0) + Number(t.amount);
    });
    return Object.entries(m).map(([name, value]) => ({ name, value, color: tags.find((g) => g.name === name)?.color || "#a98467" }));
  }, [filtered, tagMap, tags]);

  const byMember = useMemo(() => {
    const m: Record<string, { income: number; expense: number }> = {};
    filtered.forEach((t) => {
      const name = memberMap[t.user_id]?.full_name || "Member";
      m[name] = m[name] || { income: 0, expense: 0 };
      m[name][t.type] += Number(t.amount);
    });
    return Object.entries(m).map(([name, v]) => ({ name, ...v }));
  }, [filtered, memberMap]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">Hi, {profile?.full_name?.split(" ")[0] || "there"} 👋</h1>
          <p className="text-muted-foreground">Here's your family's financial picture.</p>
        </div>
        <Link to="/transactions" search={{ new: "1" }}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
          style={{ background: "var(--gradient-warm)" }}>
          <Plus className="h-4 w-4" /> Add transaction
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        <Pill active={period === "month"} onClick={() => setPeriod("month")}>This month</Pill>
        <Pill active={period === "year"} onClick={() => setPeriod("year")}>This year</Pill>
        <Pill active={period === "all"} onClick={() => setPeriod("all")}>All time</Pill>
        <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}
          className="rounded-full border border-border bg-card px-4 py-1.5 text-sm">
          <option value="all">All members</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Income" value={totalIncome} icon={TrendingUp} accent="success" />
        <StatCard label="Expenses" value={totalExpense} icon={TrendingDown} accent="destructive" />
        <StatCard label="Net" value={net} icon={Wallet} accent={net >= 0 ? "primary" : "destructive"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Spending by category">
          {byTag.length === 0 ? <Empty msg="No expenses yet — add one to see your breakdown." /> : (
            <div className="h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byTag} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
                    {byTag.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="By family member">
          {byMember.length === 0 ? <Empty msg="No activity in this period yet." /> : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={byMember}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
                  <Bar dataKey="income" fill="var(--success)" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="expense" fill="var(--primary)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card title="Recent transactions">
        {filtered.slice(0, 8).length === 0 ? <Empty msg="No transactions in this period." /> : (
          <ul className="divide-y divide-border">
            {filtered.slice(0, 8).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: t.type === "income" ? "var(--success)" : "var(--primary)" }}>
                    {t.type === "income" ? "+" : "−"}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{t.tag_id ? tagMap[t.tag_id]?.name : "Untagged"}</div>
                    <div className="text-xs text-muted-foreground">{memberMap[t.user_id]?.full_name} · {new Date(t.occurred_on).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className={`font-semibold ${t.type === "income" ? "text-success" : "text-foreground"}`}>
                  {t.type === "income" ? "+" : "−"}{formatMoney(Number(t.amount))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Pill({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className={`rounded-full px-4 py-1.5 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground hover:bg-secondary"}`}>{children}</button>;
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent: "success" | "destructive" | "primary" }) {
  const colors = { success: "var(--success)", destructive: "var(--destructive)", primary: "var(--primary)" };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: colors[accent] }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 font-display text-3xl font-bold">{formatMoney(value)}</div>
    </motion.div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="grid h-40 place-items-center text-sm text-muted-foreground">{msg}</div>;
}
