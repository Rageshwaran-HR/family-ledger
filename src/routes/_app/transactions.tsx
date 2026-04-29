import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]" style={{ background: "var(--gradient-warm)" }}>
          <Plus className="h-4 w-4" /> Add transaction
        </button>
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
