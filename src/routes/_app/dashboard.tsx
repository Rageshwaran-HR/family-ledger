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
  const [accountsBalance, setAccountsBalance] = useState<number>(0);
  const [totalDebt, setTotalDebt] = useState<number>(0);
  const [period, setPeriod] = useState<"month" | "year" | "all">("month");
  const [memberFilter, setMemberFilter] = useState<string>("all");

  const load = async () => {
    if (!profile?.family_id) return;
    const [t, g, m, a, l] = await Promise.all([
      supabase.from("transactions").select("*").eq("family_id", profile.family_id).order("occurred_on", { ascending: false }),
      supabase.from("tags").select("id,name,color").eq("family_id", profile.family_id),
      supabase.from("profiles").select("id,full_name").eq("family_id", profile.family_id),
      supabase.from("accounts").select("balance").eq("family_id", profile.family_id),
      supabase.from("loans").select("remaining_balance").eq("family_id", profile.family_id).eq("status", "active"),
    ]);
    setTxs((t.data as Tx[]) ?? []);
    setTags((g.data as Tag[]) ?? []);
    setMembers((m.data as Profile[]) ?? []);
    
    const totalBal = (a.data || []).reduce((acc: number, curr: any) => acc + Number(curr.balance || 0), 0);
    setAccountsBalance(totalBal);

    const debt = (l.data || []).reduce((acc: number, curr: any) => acc + Number(curr.remaining_balance || 0), 0);
    setTotalDebt(debt);
  };

  useEffect(() => {
    load();
    if (!profile?.family_id) return;
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "loans" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.family_id]);

  const filtered = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    return txs.filter((t) => {
      if (memberFilter !== "all" && t.user_id !== memberFilter) return false;
      if (!t.occurred_on) return true;
      const parts = t.occurred_on.slice(0, 7).split("-").map(Number);
      const txYear = parts[0];
      const txMonth = parts[1];
      if (period === "month") return txYear === currentYear && txMonth === currentMonth;
      if (period === "year") return txYear === currentYear;
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
      if (t.type === "transfer") return;
      const name = memberMap[t.user_id]?.full_name || "Member";
      m[name] = m[name] || { income: 0, expense: 0 };
      m[name][t.type as "income" | "expense"] += Number(t.amount);
    });
    return Object.entries(m).map(([name, v]) => ({ name, ...v }));
  }, [filtered, memberMap]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">Hi, {profile?.full_name?.split(" ")[0] || "there"} 👋</h1>
          <p className="text-muted-foreground">Here's your family's live financial picture.</p>
        </div>
        <Link to="/transactions" search={{ new: "1" }}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
          style={{ background: "var(--gradient-warm)" }}>
          <Plus className="h-4 w-4" /> Add transaction
        </Link>
      </header>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Pill active={period === "month"} onClick={() => setPeriod("month")}>This month</Pill>
        <Pill active={period === "year"} onClick={() => setPeriod("year")}>This year</Pill>
        <Pill active={period === "all"} onClick={() => setPeriod("all")}>All time</Pill>
        <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}
          className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs sm:text-sm shrink-0 outline-none">
          <option value="all">All family members ({members.length})</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 sm:gap-4">
        <StatCard label="Total Bank Balance" value={accountsBalance} icon={Wallet} accent="primary" />
        <StatCard label="Income" value={totalIncome} icon={TrendingUp} accent="success" />
        <StatCard label="Expenses" value={totalExpense} icon={TrendingDown} accent="destructive" />
        <StatCard label="Net Savings" value={net} icon={Wallet} accent={net >= 0 ? "success" : "destructive"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Spending by category">
          {byTag.length === 0 ? <Empty msg="No expenses yet — add one to see your breakdown." /> : (
            <div className="h-64 sm:h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byTag} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
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
            <div className="h-64 sm:h-72">
              <ResponsiveContainer>
                <BarChart data={byMember}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
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
              <li key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-xl text-white font-bold" style={{ background: t.type === "income" ? "var(--success)" : "var(--primary)" }}>
                    {t.type === "income" ? "+" : "−"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-medium truncate">{t.tag_id ? tagMap[t.tag_id]?.name : "Untagged"}</div>
                    <div className="text-[11px] text-muted-foreground">{memberMap[t.user_id]?.full_name} · {new Date(t.occurred_on).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className={`font-semibold text-sm sm:text-base pl-11 sm:pl-0 ${t.type === "income" ? "text-success" : "text-foreground"}`}>
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
  return <button onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium whitespace-nowrap ${active ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground hover:bg-secondary"}`}>{children}</button>;
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent: "success" | "destructive" | "primary" }) {
  const colors = { success: "var(--success)", destructive: "var(--destructive)", primary: "var(--primary)" };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground">{label}</span>
        <div className="grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-xl text-white" style={{ background: colors[accent] }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 sm:mt-3 font-display text-2xl sm:text-3xl font-bold truncate">{formatMoney(value)}</div>
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
