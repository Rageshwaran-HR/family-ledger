import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, X, Upload, FileSpreadsheet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_app/transactions")({
  component: Transactions,
  validateSearch: (s: Record<string, unknown>) => ({ new: s.new === "1" ? "1" : undefined }),
});

interface Tx { id: string; amount: number; type: "income" | "expense"; occurred_on: string; note: string | null; user_id: string; tag_id: string | null; account_id: string | null; }

function Transactions() {
  const search = Route.useSearch();
  const { profile, user } = useAuth();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [open, setOpen] = useState(search.new === "1");
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");

  const load = async () => {
    if (!profile?.family_id) return;
    const [t, g, a, m] = await Promise.all([
      supabase.from("transactions").select("*").order("occurred_on", { ascending: false }),
      supabase.from("tags").select("*"),
      supabase.from("accounts").select("*"),
      supabase.from("profiles").select("id,full_name").eq("family_id", profile.family_id),
    ]);
    setTxs((t.data as Tx[]) ?? []);
    setTags(g.data ?? []);
    setAccounts(a.data ?? []);
    setMembers(m.data ?? []);
  };
  useEffect(() => { load(); }, [profile?.family_id]);

  const filtered = useMemo(() => filter === "all" ? txs : txs.filter((t) => t.type === filter), [txs, filter]);
  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));

  const del = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">All family income & expenses.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary">
            <Upload className="h-4 w-4" /> Import CSV/Excel
          </button>
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]" style={{ background: "var(--gradient-warm)" }}>
            <Plus className="h-4 w-4" /> Add transaction
          </button>
        </div>
      </header>

      <div className="flex gap-2">
        {(["all", "income", "expense"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${filter === f ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-secondary"}`}>{f}</button>
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {filtered.length === 0 ? (
          <div className="grid h-48 place-items-center text-sm text-muted-foreground">No transactions yet. Add your first one.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white text-lg font-bold" style={{ background: t.type === "income" ? "var(--success)" : "var(--primary)" }}>
                    {t.type === "income" ? "+" : "−"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {t.tag_id && <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: tagMap[t.tag_id]?.color + "33", color: tagMap[t.tag_id]?.color }}>{tagMap[t.tag_id]?.name}</span>}
                      <span className="truncate text-sm text-muted-foreground">{t.note || "No note"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{memberMap[t.user_id]?.full_name} · {new Date(t.occurred_on).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`font-semibold ${t.type === "income" ? "text-success" : ""}`}>{t.type === "income" ? "+" : "−"}{formatMoney(Number(t.amount))}</div>
                  {t.user_id === user?.id && <button onClick={() => del(t.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>{open && <TxDialog onClose={() => setOpen(false)} onSaved={() => { load(); setOpen(false); }} tags={tags} accounts={accounts} />}</AnimatePresence>
      <AnimatePresence>{importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={() => { load(); setImportOpen(false); }} tags={tags} accounts={accounts} />}</AnimatePresence>
    </div>
  );
}

function TxDialog({ onClose, onSaved, tags, accounts }: { onClose: () => void; onSaved: () => void; tags: any[]; accounts: any[] }) {
  const { profile, user } = useAuth();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tagId, setTagId] = useState<string>(tags[0]?.id ?? "");
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id || !user) return;
    setLoading(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id, family_id: profile.family_id, type, amount: Number(amount),
      occurred_on: date, tag_id: tagId || null, account_id: accountId || null, note: note || null,
    });
    if (error) { toast.error(error.message); setLoading(false); return; }
    toast.success("Transaction added");
    onSaved();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} onSubmit={save}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Add transaction</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setType("expense")} className={`rounded-xl py-2.5 text-sm font-semibold ${type === "expense" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Expense</button>
          <button type="button" onClick={() => setType("income")} className={`rounded-xl py-2.5 text-sm font-semibold ${type === "income" ? "bg-success text-success-foreground" : "bg-secondary"}`}>Income</button>
        </div>

        <div className="mt-4 space-y-3">
          <Input label="Amount" type="number" step="0.01" min="0" value={amount} onChange={setAmount} required />
          <Input label="Date" type="date" value={date} onChange={setDate} required />
          <Select label="Category" value={tagId} onChange={setTagId} options={tags.map((t) => ({ value: t.id, label: t.name }))} />
          <Select label="Account" value={accountId} onChange={setAccountId} options={[{ value: "", label: "None" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
          <Input label="Note (optional)" value={note} onChange={setNote} />
        </div>

        <button disabled={loading} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
          {loading ? "Saving…" : "Save transaction"}
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
  const [step, setStep] = useState<"upload" | "map" | "importing">("upload");
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
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: "", raw: false });
      if (json.length === 0) { toast.error("No rows found in file."); return; }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRows(json);
      setMapping(guessMapping(hdrs));
      setStep("map");
    } catch (e: any) {
      toast.error("Could not read file: " + e.message);
    }
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
        family_id: profile.family_id, name, color: colors[i % colors.length], icon: "Tag", created_by: user.id,
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
      const acctId = mapping.account ? acctMap.get(String(r[mapping.account] ?? "").toLowerCase().trim()) ?? defaultAccount || null : (defaultAccount || null);
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
              <button onClick={() => setStep("upload")} className="rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary">Back</button>
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
