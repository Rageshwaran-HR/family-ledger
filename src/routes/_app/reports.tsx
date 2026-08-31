import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { FileDown, FileSpreadsheet, TrendingUp, TrendingDown, Wallet, PiggyBank } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports")({ component: Reports });

function Reports() {
  const { profile } = useAuth();
  const [txs, setTxs] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("all");

  useEffect(() => {
    if (!profile?.family_id) return;
    (async () => {
      const [t, g, m] = await Promise.all([
        supabase.from("transactions").select("*").order("occurred_on", { ascending: false }),
        supabase.from("tags").select("id,name"),
        supabase.from("profiles").select("id,full_name").eq("family_id", profile.family_id!),
      ]);
      setTxs(t.data ?? []); setTags(g.data ?? []); setMembers(m.data ?? []);
    })();
  }, [profile?.family_id]);

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t.name]));
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.full_name]));

  // Discover all unique years in dataset
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    txs.forEach((t) => {
      if (t.occurred_on) years.add(t.occurred_on.slice(0, 4));
    });
    return Array.from(years).sort().reverse();
  }, [txs]);

  // Filter transactions by year
  const filteredTxs = useMemo(() => {
    if (selectedYear === "all") return txs;
    return txs.filter((t) => t.occurred_on.startsWith(selectedYear));
  }, [txs, selectedYear]);

  const monthly = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    filteredTxs.forEach((t) => {
      const k = t.occurred_on.slice(0, 7);
      map[k] = map[k] || { income: 0, expense: 0 };
      map[k][t.type as "income" | "expense"] += Number(t.amount);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a)).map(([month, v]) => ({ month, ...v, net: v.income - v.expense }));
  }, [filteredTxs]);

  const totalIncome = monthly.reduce((s, m) => s + m.income, 0);
  const totalExpense = monthly.reduce((s, m) => s + m.expense, 0);
  const totalNet = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((totalNet / totalIncome) * 100)) : 0;

  const rows = filteredTxs.map((t) => ({
    Date: t.occurred_on, Type: t.type, Amount: Number(t.amount),
    Category: t.tag_id ? tagMap[t.tag_id] : "", Member: memberMap[t.user_id] || "", Note: t.note || "",
  }));

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.text(`Family Finance Report (${selectedYear === "all" ? "All Time" : selectedYear})`, 14, 18);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Total Income: ${formatMoney(totalIncome)}  |  Total Expense: ${formatMoney(totalExpense)}  |  Net: ${formatMoney(totalNet)} (${savingsRate}% savings rate)`, 14, 25);
    autoTable(doc, { startY: 32, head: [["Month", "Income", "Expense", "Net"]],
      body: monthly.map((m) => [m.month, formatMoney(m.income), formatMoney(m.expense), formatMoney(m.net)]),
      headStyles: { fillColor: [193, 102, 60] } });
    autoTable(doc, { head: [["Date", "Type", "Amount", "Category", "Member", "Note"]],
      body: rows.map((r) => [r.Date, r.Type, formatMoney(r.Amount), r.Category, r.Member, r.Note]),
      headStyles: { fillColor: [193, 102, 60] } });
    doc.save(`hearth-report-${selectedYear}-${new Date().toISOString().slice(0,10)}.pdf`);
    toast.success("PDF exported");
  };

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthly), "Monthly Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Transactions");
    XLSX.writeFile(wb, `hearth-report-${selectedYear}-${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success("Excel exported");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Reports & insights</h1>
          <p className="text-muted-foreground text-sm">Monthly summaries and multi-format exports.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="flex-1 sm:flex-initial rounded-full border border-border bg-card px-3.5 py-2 text-xs sm:text-sm font-medium"
          >
            <option value="all">All Years</option>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportPDF} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full bg-card border border-border px-3.5 py-2 text-xs sm:text-sm font-semibold hover:bg-secondary">
            <FileDown className="h-4 w-4" /> PDF
          </button>
          <button onClick={exportXLSX} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">Income</span>
            <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 font-display text-lg sm:text-2xl font-bold text-emerald-600 truncate">+{formatMoney(totalIncome)}</div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">Expenses</span>
            <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg bg-rose-500/10 text-rose-600">
              <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 font-display text-lg sm:text-2xl font-bold text-rose-600 truncate">−{formatMoney(totalExpense)}</div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">Net Savings</span>
            <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
          </div>
          <div className={`mt-2 sm:mt-3 font-display text-lg sm:text-2xl font-bold truncate ${totalNet >= 0 ? "text-foreground" : "text-rose-600"}`}>
            {formatMoney(totalNet)}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">Savings Rate</span>
            <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600">
              <PiggyBank className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 font-display text-lg sm:text-2xl font-bold text-amber-600">{savingsRate}%</div>
        </div>
      </div>

      <section className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)]">
        <h2 className="mb-4 font-display text-base sm:text-lg font-semibold">Monthly summary ({selectedYear === "all" ? "All Time" : selectedYear})</h2>
        {monthly.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No data for selected period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[360px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-2">Month</th><th>Income</th><th>Expense</th><th>Net</th></tr></thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month} className="border-t border-border">
                    <td className="py-2 font-medium">{m.month}</td>
                    <td className="text-emerald-600">+{formatMoney(m.income)}</td>
                    <td className="text-rose-600">−{formatMoney(m.expense)}</td>
                    <td className={`font-semibold ${m.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatMoney(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

