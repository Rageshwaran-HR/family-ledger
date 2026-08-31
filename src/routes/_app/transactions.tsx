import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, X, Upload, FileSpreadsheet, Pencil, Search, Filter, Sparkles, Share2, Receipt, Briefcase, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { parseBankOrUpiReceipt } from "@/lib/upi-receipt-parser";

export const Route = createFileRoute("/_app/transactions")({
  component: Transactions,
  validateSearch: (s: Record<string, unknown>) => ({
    new: s.new === "1" ? "1" : undefined,
    share_text: typeof s.share_text === "string" ? s.share_text : typeof s.text === "string" ? (s.text as string) : undefined,
    share_title: typeof s.share_title === "string" ? s.share_title : typeof s.title === "string" ? (s.title as string) : undefined,
  }),
});

interface Tx { id: string; amount: number; type: "income" | "expense"; occurred_on: string; note: string | null; user_id: string; tag_id: string | null; account_id: string | null; }

function Transactions() {
  const search = Route.useSearch();
  const { profile, user, isAdmin } = useAuth();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [open, setOpen] = useState(search.new === "1");
  const [scanOpen, setScanOpen] = useState(!!search.share_text || !!search.share_title);
  const [initialSharedText, setInitialSharedText] = useState(search.share_text || search.share_title || "");
  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    if (!profile?.family_id) return;
    const [t, g, a, m, c] = await Promise.all([
      supabase.from("transactions").select("*").order("occurred_on", { ascending: false }),
      supabase.from("tags").select("*"),
      supabase.from("accounts").select("*"),
      supabase.from("profiles").select("id,full_name").eq("family_id", profile.family_id),
      supabase.from("business_clients").select("id,name,business_id,monthly_amount,is_active").eq("family_id", profile.family_id),
    ]);
    setTxs((t.data as Tx[]) ?? []);
    setTags(g.data ?? []);
    setAccounts(a.data ?? []);
    setMembers(m.data ?? []);
    setClients(c.data ?? []);
  };

  useEffect(() => {
    load();
    if (!profile?.family_id) return;
    const channel = supabase
      .channel("tx-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.family_id]);

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

  const exportExcel = () => {
    if (filtered.length === 0) {
      toast.error("No transactions to export");
      return;
    }
    const rows = filtered.map((t) => ({
      "Date": t.occurred_on,
      "Type": t.type,
      "Amount": Number(t.amount),
      "Category": t.tag_id ? tagMap[t.tag_id]?.name || "" : "Uncategorized",
      "Account": t.account_id ? accountMap[t.account_id]?.name || "" : "",
      "Member": memberMap[t.user_id]?.full_name || "",
      "Note": t.note || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `Family_Transactions_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Transactions exported successfully");
  };

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      if (filter !== "all" && t.type !== filter) return false;
      if (categoryFilter !== "all" && t.tag_id !== categoryFilter) return false;
      if (accountFilter !== "all" && t.account_id !== accountFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const note = (t.note || "").toLowerCase();
        const tag = (t.tag_id ? tagMap[t.tag_id]?.name || "" : "").toLowerCase();
        const member = (memberMap[t.user_id]?.full_name || "").toLowerCase();
        const amt = String(t.amount);
        if (!note.includes(q) && !tag.includes(q) && !member.includes(q) && !amt.includes(q)) return false;
      }
      return true;
    });
  }, [txs, filter, categoryFilter, accountFilter, searchQuery, tagMap, memberMap]);

  const del = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground text-sm">All family income & expenses.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setScanOpen(true)} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
            <Sparkles className="h-3.5 w-3.5" /> ⚡ Scan / Paste Receipt
          </button>
          <button onClick={exportExcel} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full bg-card border border-border px-3.5 py-2 text-xs font-semibold hover:bg-secondary">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export
          </button>
          <button onClick={() => setImportOpen(true)} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full bg-card border border-border px-3.5 py-2 text-xs font-semibold hover:bg-secondary">
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
          <button onClick={() => { setEditTx(null); setOpen(true); }} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]" style={{ background: "var(--gradient-warm)" }}>
            <Plus className="h-4 w-4" /> Add transaction
          </button>
        </div>
      </header>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(["all", "income", "expense"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize whitespace-nowrap ${filter === f ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-secondary"}`}>{f}</button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes, tags, members…"
            className="w-full rounded-full border border-input bg-card pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium truncate"
          >
            <option value="all">All categories</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium truncate"
          >
            <option value="all">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="grid h-48 place-items-center text-sm text-muted-foreground px-4 text-center">
            {txs.length === 0 ? "No transactions yet. Add your first one." : "No transactions match your current filters."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((t) => (
              <li key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors">
                <div className="flex min-w-0 items-start sm:items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white text-base font-bold" style={{ background: t.type === "income" ? "var(--success)" : "var(--primary)" }}>
                    {t.type === "income" ? "+" : "−"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.tag_id && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: (tagMap[t.tag_id]?.color || "#a98467") + "33", color: tagMap[t.tag_id]?.color || "#a98467" }}>
                          {tagMap[t.tag_id]?.name || "Tag"}
                        </span>
                      )}
                      {t.account_id && accountMap[t.account_id] && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                          {accountMap[t.account_id].name}
                        </span>
                      )}
                      <span className="truncate text-xs sm:text-sm text-muted-foreground font-normal">{t.note || "No note"}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{memberMap[t.user_id]?.full_name || "Member"} · {new Date(t.occurred_on).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 pl-12 sm:pl-0">
                  <div className={`font-semibold text-sm sm:text-base ${t.type === "income" ? "text-success" : ""}`}>{t.type === "income" ? "+" : "−"}{formatMoney(Number(t.amount))}</div>
                  {(t.user_id === user?.id || isAdmin) && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditTx(t); setOpen(true); }} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-primary">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => del(t.id)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <TxDialog
            tx={editTx}
            onClose={() => { setOpen(false); setEditTx(null); }}
            onSaved={() => { load(); setOpen(false); setEditTx(null); }}
            tags={tags}
            accounts={accounts}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {scanOpen && (
          <ReceiptParserDialog
            initialText={initialSharedText}
            tags={tags}
            accounts={accounts}
            clients={clients}
            onClose={() => { setScanOpen(false); setInitialSharedText(""); }}
            onSaved={() => { load(); setScanOpen(false); setInitialSharedText(""); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={() => { load(); setImportOpen(false); }} tags={tags} accounts={accounts} />}</AnimatePresence>
    </div>
  );
}

function TxDialog({ tx, onClose, onSaved, tags, accounts }: { tx?: Tx | null; onClose: () => void; onSaved: () => void; tags: any[]; accounts: any[] }) {
  const { profile, user } = useAuth();
  const [type, setType] = useState<"expense" | "income">(tx?.type ?? "expense");
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [date, setDate] = useState(tx?.occurred_on ?? new Date().toISOString().slice(0, 10));
  const [tagId, setTagId] = useState<string>(tx?.tag_id ?? tags[0]?.id ?? "");
  const [accountId, setAccountId] = useState<string>(tx?.account_id ?? accounts[0]?.id ?? "");
  const [note, setNote] = useState(tx?.note ?? "");
  const [loading, setLoading] = useState(false);

  const isEdit = !!tx;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id) {
      toast.error("Please set up your household first in the Family tab.");
      return;
    }
    if (!accountId) {
      toast.error("Please select a bank account or cash wallet for this transaction.");
      return;
    }
    if (!user) return;
    setLoading(true);

    if (isEdit) {
      const { error } = await supabase.from("transactions").update({
        type,
        amount: Number(amount),
        occurred_on: date,
        tag_id: tagId || null,
        account_id: accountId,
        note: note.trim() || null,
      }).eq("id", tx.id);
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Transaction updated");
    } else {
      const { error } = await supabase.from("transactions").insert({
        user_id: user.id,
        family_id: profile.family_id,
        type,
        amount: Number(amount),
        occurred_on: date,
        tag_id: tagId || null,
        account_id: accountId,
        note: note.trim() || null,
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Transaction added");
    }
    onSaved();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} onSubmit={save}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{isEdit ? "Edit transaction" : "Add transaction"}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setType("expense")} className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${type === "expense" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Expense</button>
          <button type="button" onClick={() => setType("income")} className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${type === "income" ? "bg-success text-success-foreground" : "bg-secondary"}`}>Income</button>
        </div>

        <div className="mt-4 space-y-3">
          <Input label="Amount" type="number" step="0.01" min="0" value={amount} onChange={setAmount} required autoFocus />
          <Input label="Date" type="date" value={date} onChange={setDate} required />
          <Select label="Category" value={tagId} onChange={setTagId} options={[{ value: "", label: "None" }, ...tags.map((t) => ({ value: t.id, label: t.name }))]} />
          
          {accounts.length === 0 ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <strong>No accounts found:</strong> Please go to the <strong>Accounts</strong> tab and create a Bank Account or Cash Wallet first.
            </div>
          ) : (
            <Select label="Bank / Wallet Account *" value={accountId} onChange={setAccountId} required options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${formatMoney(Number(a.balance))})` }))} />
          )}

          <Input label="Note (optional)" value={note} onChange={setNote} placeholder="Grocery store, coffee, etc." />
        </div>

        <button disabled={loading || accounts.length === 0} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-warm)" }}>
          {loading ? "Saving…" : isEdit ? "Update transaction" : "Save transaction"}
        </button>
      </motion.form>
    </motion.div>
  );
}

function Input({ label, value, onChange, ...rest }: any) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
    </label>
  );
}
function Select({ label, value, onChange, options }: any) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
        {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ====== Import Dialog ======

type ImportRow = Record<string, any>;
type FieldKey = "date" | "amount" | "type" | "note" | "category" | "account";
const FIELD_LABELS: Record<FieldKey, string> = {
  date: "Date *",
  amount: "Amount *",
  type: "Type (income/expense) *",
  note: "Note",
  category: "Category / Tag",
  account: "Account",
};

function guessMapping(headers: string[]): Record<FieldKey, string> {
  const find = (...needles: string[]) => headers.find((h) => needles.some((n) => h.toLowerCase().includes(n))) || "";
  return {
    date: find("date", "occurred", "when"),
    amount: find("amount", "value", "total"),
    type: find("type", "kind", "direction"),
    note: find("note", "memo", "description", "desc"),
    category: find("category", "tag", "label"),
    account: find("account", "wallet", "source"),
  };
}

function ImportDialog({ onClose, onImported, tags, accounts }: { onClose: () => void; onImported: () => void; tags: any[]; accounts: any[] }) {
  const { profile, user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "sheet" | "map" | "importing">("upload");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [sheetPreview, setSheetPreview] = useState<any[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({ date: "", amount: "", type: "", note: "", category: "", account: "" });
  const [defaultType, setDefaultType] = useState<"expense" | "income">("expense");
  const [defaultAccount, setDefaultAccount] = useState<string>(accounts[0]?.id ?? "");
  const [createMissingTags, setCreateMissingTags] = useState(true);

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (wb.SheetNames.length === 0) { toast.error("No sheets found in file."); return; }
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      setSelectedSheet(wb.SheetNames[0]);
      setHeaderRow(1);
      previewSheet(wb, wb.SheetNames[0]);
      setStep("sheet");
    } catch (e: any) {
      toast.error("Could not read file: " + e.message);
    }
  };

  const previewSheet = (wb: XLSX.WorkBook, name: string) => {
    const sheet = wb.Sheets[name];
    if (!sheet) { setSheetPreview([]); return; }
    const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
    setSheetPreview(aoa.slice(0, 10) as any[][]);
  };

  const confirmSheet = () => {
    if (!workbook || !selectedSheet) return;
    const sheet = workbook.Sheets[selectedSheet];
    const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
    if (aoa.length < headerRow) { toast.error("Header row is beyond the sheet's data."); return; }
    const rawHeaders = (aoa[headerRow - 1] || []).map((h: any, i: number) => {
      const v = String(h ?? "").trim();
      return v || `Column ${i + 1}`;
    });
    // Deduplicate
    const seen = new Map<string, number>();
    const hdrs = rawHeaders.map((h: string) => {
      const c = seen.get(h) || 0;
      seen.set(h, c + 1);
      return c === 0 ? h : `${h} (${c + 1})`;
    });
    const dataRows = aoa.slice(headerRow).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
    const json: ImportRow[] = dataRows.map((r) => {
      const o: ImportRow = {};
      hdrs.forEach((h, i) => { o[h] = r[i] ?? ""; });
      return o;
    });
    if (json.length === 0) { toast.error("No data rows found below the header row."); return; }
    setHeaders(hdrs);
    setRows(json);
    setMapping(guessMapping(hdrs));
    setStep("map");
  };

  const parseDate = (v: any): string | null => {
    if (!v) return null;
    const s = String(v).trim();
    // try ISO
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  };

  const runImport = async () => {
    if (!profile?.family_id || !user) return;
    if (!mapping.date || !mapping.amount) { toast.error("Please map Date and Amount columns."); return; }
    setStep("importing");

    // Build tag and account lookup (case-insensitive)
    const tagMap = new Map<string, string>(tags.map((t: any) => [t.name.toLowerCase(), t.id]));
    const acctMap = new Map<string, string>(accounts.map((a: any) => [a.name.toLowerCase(), a.id]));

    // Determine which tag names are missing and need to be created
    const newTagNames = new Set<string>();
    if (mapping.category && createMissingTags) {
      rows.forEach((r) => {
        const name = String(r[mapping.category] ?? "").trim();
        if (name && !tagMap.has(name.toLowerCase())) newTagNames.add(name);
      });
    }

    // Create missing tags
    if (newTagNames.size > 0) {
      const colors = ["#e76f51","#a98467","#2a9d8f","#e9c46a","#ef476f","#9d4edd","#06a77d","#6c757d"];
      const inserts = Array.from(newTagNames).map((name, i) => ({
        family_id: profile.family_id!, name, color: colors[i % colors.length], icon: "Tag", created_by: user.id,
      }));
      const { data: created, error: tErr } = await supabase.from("tags").insert(inserts).select("id,name");
      if (tErr) { toast.error("Tag creation failed: " + tErr.message); setStep("map"); return; }
      created?.forEach((t: any) => tagMap.set(t.name.toLowerCase(), t.id));
    }

    // Build transaction rows
    const inserts: any[] = [];
    const errors: string[] = [];
    rows.forEach((r, idx) => {
      const dateStr = parseDate(r[mapping.date]);
      const amtRaw = String(r[mapping.amount] ?? "").replace(/[^0-9.\-]/g, "");
      const amt = parseFloat(amtRaw);
      if (!dateStr || isNaN(amt)) { errors.push(`Row ${idx + 2}: invalid date or amount`); return; }

      let type: "income" | "expense" = defaultType;
      if (mapping.type) {
        const t = String(r[mapping.type] ?? "").toLowerCase();
        if (t.includes("income") || t.includes("credit") || t === "in") type = "income";
        else if (t.includes("expense") || t.includes("debit") || t === "out") type = "expense";
      }
      // Negative amount → expense
      let absAmt = Math.abs(amt);
      if (amt < 0 && !mapping.type) type = "expense";

      const tagId = mapping.category ? tagMap.get(String(r[mapping.category] ?? "").toLowerCase().trim()) ?? null : null;
      const acctId = mapping.account
        ? (acctMap.get(String(r[mapping.account] ?? "").toLowerCase().trim()) ?? (defaultAccount || null))
        : (defaultAccount || null);
      const note = mapping.note ? String(r[mapping.note] ?? "").trim() || null : null;

      inserts.push({
        user_id: user.id, family_id: profile.family_id,
        type, amount: absAmt, occurred_on: dateStr,
        tag_id: tagId, account_id: acctId, note,
      });
    });

    if (inserts.length === 0) {
      toast.error("No valid rows to import.");
      setStep("map");
      return;
    }

    // Batch in chunks of 500
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += 500) {
      const chunk = inserts.slice(i, i + 500);
      const { error } = await supabase.from("transactions").insert(chunk);
      if (error) { toast.error("Import failed: " + error.message); setStep("map"); return; }
      inserted += chunk.length;
    }

    toast.success(`Imported ${inserted} transaction${inserted === 1 ? "" : "s"}${errors.length ? `, skipped ${errors.length}` : ""}`);
    onImported();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Import transactions</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        {step === "upload" && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">Upload a CSV or Excel file (.csv, .xlsx, .xls). The first row should contain column headers like Date, Amount, Type, Category, Account, Note.</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid w-full place-items-center gap-3 rounded-3xl border-2 border-dashed border-border p-10 hover:bg-secondary/50 transition-colors"
            >
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
              <div>
                <div className="font-semibold">Click to choose a file</div>
                <div className="text-xs text-muted-foreground">CSV, XLSX, or XLS</div>
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {step === "sheet" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Worksheet</span>
                <select
                  value={selectedSheet}
                  onChange={(e) => { setSelectedSheet(e.target.value); if (workbook) previewSheet(workbook, e.target.value); }}
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm"
                >
                  {sheetNames.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Header is on row #</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, sheetPreview.length)}
                  value={headerRow}
                  onChange={(e) => setHeaderRow(Math.max(1, parseInt(e.target.value || "1", 10)))}
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm"
                />
              </label>
            </div>

            {sheetPreview.length > 0 && (
              <div className="rounded-2xl border border-border overflow-hidden">
                <div className="bg-secondary/50 px-3 py-2 text-xs font-semibold">Sheet preview (first 10 rows) — header row highlighted</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {sheetPreview.map((row, i) => (
                        <tr key={i} className={i + 1 === headerRow ? "bg-primary/15 font-semibold" : "border-t border-border"}>
                          <td className="px-2 py-1.5 text-muted-foreground w-8">{i + 1}</td>
                          {row.map((cell, j) => (
                            <td key={j} className="px-2 py-1.5 whitespace-nowrap max-w-[160px] truncate">{String(cell ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep("upload")} className="rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary">Back</button>
              <button onClick={confirmSheet} className="flex-1 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>Continue with this sheet</button>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary/50 p-3 text-sm">
              <strong>{rows.length}</strong> rows detected. Map your columns below — we tried to match them automatically.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(FIELD_LABELS) as FieldKey[]).map((key) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">{FIELD_LABELS[key]}</span>
                  <select
                    value={mapping[key]}
                    onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                    className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm"
                  >
                    <option value="">— Not mapped —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Defaults & options</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Default type (when not mapped)</span>
                  <select value={defaultType} onChange={(e) => setDefaultType(e.target.value as any)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Default account</span>
                  <select value={defaultAccount} onChange={(e) => setDefaultAccount(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
                    <option value="">None</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={createMissingTags} onChange={(e) => setCreateMissingTags(e.target.checked)} />
                Auto-create missing categories as new tags
              </label>
            </div>

            {/* Preview */}
            {rows.length > 0 && (
              <div className="rounded-2xl border border-border overflow-hidden">
                <div className="bg-secondary/50 px-3 py-2 text-xs font-semibold">Preview (first 3 rows)</div>
                <div className="divide-y divide-border text-xs">
                  {rows.slice(0, 3).map((r, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 px-3 py-2 sm:grid-cols-4">
                      <div><span className="text-muted-foreground">Date:</span> {String(r[mapping.date] ?? "—")}</div>
                      <div><span className="text-muted-foreground">Amount:</span> {String(r[mapping.amount] ?? "—")}</div>
                      <div><span className="text-muted-foreground">Cat:</span> {mapping.category ? String(r[mapping.category] ?? "—") : "—"}</div>
                      <div><span className="text-muted-foreground">Note:</span> {mapping.note ? String(r[mapping.note] ?? "—") : "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep("sheet")} className="rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary">Back</button>
              <button onClick={runImport} className="flex-1 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>Import {rows.length} rows</button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="grid place-items-center py-12 text-sm text-muted-foreground">Importing…</div>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * Universal UPI & Bank Receipt / SMS Parser Modal (Zero API, Works for any Banking/UPI App)
 */
function ReceiptParserDialog({
  initialText = "",
  tags,
  accounts,
  clients,
  onClose,
  onSaved,
}: {
  initialText?: string;
  tags: any[];
  accounts: any[];
  clients: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, profile } = useAuth();
  const [text, setText] = useState(initialText);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tagId, setTagId] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [matchedClientId, setMatchedClientId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Parse text whenever changed
  useEffect(() => {
    if (!text.trim()) return;
    const p = parseBankOrUpiReceipt(text);
    if (p.amount !== null) setAmount(String(p.amount));
    setType(p.type);
    setNote(p.merchantOrSender + (p.upiRef ? ` (Ref: ${p.upiRef})` : ""));
    setDate(p.date);

    // Auto-match tag
    const matchedTag = tags.find((t) => t.name.toLowerCase() === p.categorySuggestion.toLowerCase());
    if (matchedTag) setTagId(matchedTag.id);
    else if (tags[0]) setTagId(tags[0].id);

    // Auto-match account by mask
    if (p.accountMask && accounts.length > 0) {
      const matchAcc = accounts.find((a) => a.name.includes(p.accountMask!) || a.name.toLowerCase().includes(p.accountMask!));
      if (matchAcc) setAccountId(matchAcc.id);
    }

    // Auto-match business client
    if (p.type === "income" && clients.length > 0) {
      const mClient = clients.find((c) =>
        text.toLowerCase().includes(c.name.toLowerCase()) ||
        p.merchantOrSender.toLowerCase().includes(c.name.toLowerCase())
      );
      if (mClient) setMatchedClientId(mClient.id);
      else setMatchedClientId("");
    }
  }, [text, tags, accounts, clients]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id || !user) return;
    if (!amount || Number(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!accountId) {
      toast.error("Please select a bank account or wallet");
      return;
    }

    setLoading(true);
    try {
      // If matched with business client, also record client payment
      if (type === "income" && matchedClientId) {
        const client = clients.find((c) => c.id === matchedClientId);
        if (client) {
          await supabase.from("client_payments").insert({
            family_id: profile.family_id,
            business_id: client.business_id,
            client_id: client.id,
            amount: Number(amount),
            payment_date: date,
            note: `UPI Receipt Sync: ${note}`,
          });
          toast.success(`Client ${client.name} payment recorded!`);
        }
      }

      // Record transaction
      const { error } = await supabase.from("transactions").insert({
        family_id: profile.family_id,
        user_id: user.id,
        account_id: accountId,
        tag_id: tagId || null,
        type,
        amount: Number(amount),
        occurred_on: date,
        note: note.trim() || null,
      });

      if (error) throw error;
      toast.success("Receipt transaction recorded in ledger!");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">Paste / Scan UPI & Bank Receipt</h2>
              <p className="text-xs text-muted-foreground">Works with GPay, PhonePe, Paytm, SMS & Any Bank</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Textarea */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-foreground">
            Paste Receipt Text or Bank SMS:
          </span>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Paid ₹450 to Swiggy on Google Pay (UPI Ref: 482910394812)... or paste HDFC/SBI bank debit SMS"
            className="w-full rounded-2xl border border-input bg-background p-3 text-xs outline-none focus:border-primary font-mono"
            autoFocus
          />
        </label>

        {/* Live Extracted Fields */}
        <div className="rounded-2xl border border-border/80 bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Parsed Transaction Details</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${type === "income" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-primary/20 text-primary"}`}>
              {type === "income" ? "Income / Credit" : "Expense / Debit"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Amount (₹)</span>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-bold text-base" required />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Category Tag</span>
              <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs">
                <option value="">— Uncategorized —</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Bank Account / Wallet</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatMoney(Number(a.balance))})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Description / Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Swiggy Food, Petrol, etc." className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs" />
            </label>
          </div>

          {/* Business Client Matching if Income */}
          {type === "income" && clients.length > 0 && (
            <div className="border-t border-border pt-2.5">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" /> Match Business Client (Auto-clears monthly plan)
                </span>
                <select value={matchedClientId} onChange={(e) => setMatchedClientId(e.target.value)} className="w-full rounded-xl border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-200">
                  <option value="">— Personal Income (Not a Client) —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      👤 Client: {c.name} ({formatMoney(Number(c.monthly_amount))}/mo)
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <button disabled={loading} className="w-full rounded-full px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60 shadow-[var(--shadow-soft)]" style={{ background: "var(--gradient-warm)" }}>
          {loading ? "Recording…" : "Save Transaction to Ledger"}
        </button>
      </motion.form>
    </motion.div>
  );
}

