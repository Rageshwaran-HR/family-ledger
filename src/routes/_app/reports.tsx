import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { FileDown, FileSpreadsheet } from "lucide-react";
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

  const monthly = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    txs.forEach((t) => {
      const k = t.occurred_on.slice(0, 7);
      map[k] = map[k] || { income: 0, expense: 0 };
      map[k][t.type as "income" | "expense"] += Number(t.amount);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a)).map(([month, v]) => ({ month, ...v, net: v.income - v.expense }));
  }, [txs]);

  const rows = txs.map((t) => ({
    Date: t.occurred_on, Type: t.type, Amount: Number(t.amount),
    Category: t.tag_id ? tagMap[t.tag_id] : "", Member: memberMap[t.user_id] || "", Note: t.note || "",
  }));

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.text("Family Finance Report", 14, 18);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 14, 25);
    autoTable(doc, { startY: 32, head: [["Month", "Income", "Expense", "Net"]],
      body: monthly.map((m) => [m.month, formatMoney(m.income), formatMoney(m.expense), formatMoney(m.net)]),
      headStyles: { fillColor: [193, 102, 60] } });
    autoTable(doc, { head: [["Date", "Type", "Amount", "Category", "Member", "Note"]],
      body: rows.map((r) => [r.Date, r.Type, formatMoney(r.Amount), r.Category, r.Member, r.Note]),
      headStyles: { fillColor: [193, 102, 60] } });
    doc.save(`hearth-report-${new Date().toISOString().slice(0,10)}.pdf`);
    toast.success("PDF exported");
  };
  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthly), "Monthly");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Transactions");
    XLSX.writeFile(wb, `hearth-report-${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success("Excel exported");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Reports & insights</h1>
          <p className="text-muted-foreground">Monthly summaries with one-click exports.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportPDF} className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"><FileDown className="h-4 w-4" /> PDF</button>
          <button onClick={exportXLSX} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
        </div>
      </header>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <h2 className="mb-4 font-display text-lg font-semibold">Monthly summary</h2>
        {monthly.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No data yet.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2">Month</th><th>Income</th><th>Expense</th><th>Net</th></tr></thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month} className="border-t border-border">
                    <td className="py-2 font-medium">{m.month}</td>
                    <td className="text-success">+{formatMoney(m.income)}</td>
                    <td>−{formatMoney(m.expense)}</td>
                    <td className={`font-semibold ${m.net >= 0 ? "text-success" : "text-destructive"}`}>{formatMoney(m.net)}</td>
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
