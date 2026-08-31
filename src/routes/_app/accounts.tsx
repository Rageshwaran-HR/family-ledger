import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Wallet, CreditCard, Banknote, Smartphone, Trash2, Pencil, ArrowRightLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_app/accounts")({ component: Accounts });

const TYPES = [
  { value: "bank", label: "Bank", icon: Banknote },
  { value: "cash", label: "Cash", icon: Wallet },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "wallet", label: "Wallet", icon: Smartphone },
  { value: "other", label: "Other", icon: Wallet },
];

function Accounts() {
  const { profile, user, isAdmin } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);

  const load = async () => {
    if (!profile?.family_id) return;
    const [a, m] = await Promise.all([
      supabase.from("accounts").select("*").order("name"),
      supabase.from("profiles").select("id,full_name").eq("family_id", profile.family_id),
    ]);
    setList(a.data ?? []); setMembers(m.data ?? []);
  };

  useEffect(() => {
    load();
    if (!profile?.family_id) return;
    // Realtime channel for live sync
    const channel = supabase
      .channel("accounts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.family_id]);

  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
  const totalBalance = list.reduce((s, a) => s + Number(a.balance || 0), 0);

  const del = async (id: string) => {
    if (!confirm("Delete this account? Associated transactions will have their account unlinked.")) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Accounts</h1>
          <p className="text-muted-foreground text-sm">Bank accounts, cash, cards & wallets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {list.length >= 2 && (
            <button
              onClick={() => setTransferOpen(true)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs sm:text-sm font-semibold text-foreground hover:bg-secondary"
            >
              <ArrowRightLeft className="h-4 w-4" /> Transfer
            </button>
          )}
          <button onClick={() => { setEditingAccount(null); setOpen(true); }} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
            <Plus className="h-4 w-4" /> Add account
          </button>
        </div>
      </header>

      {/* Net worth card */}
      <div className="rounded-3xl border border-border p-6 shadow-[var(--shadow-soft)]" style={{ background: "var(--gradient-warm)", color: "white" }}>
        <div className="text-sm opacity-90">Total liquid balance across accounts</div>
        <div className="mt-1 font-display text-4xl font-bold">{formatMoney(totalBalance)}</div>
        <div className="mt-1 text-xs opacity-80">{list.length} account{list.length === 1 ? "" : "s"} tracked</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a) => {
          const T = TYPES.find((t) => t.value === a.type) || TYPES[0];
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="relative rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
                  <T.icon className="h-5 w-5" />
                </div>
                {(a.user_id === user?.id || isAdmin) && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingAccount(a); setOpen(true); }} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-primary">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => del(a.id)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-4 text-sm font-medium text-foreground">{a.name}</div>
              <div className="font-display text-2xl font-bold">{formatMoney(Number(a.balance), a.currency)}</div>
              <div className="mt-2 text-xs text-muted-foreground">{memberMap[a.user_id]?.full_name || "Member"} · {T.label}</div>
            </motion.div>
          );
        })}
        {list.length === 0 && <div className="col-span-full rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No accounts yet — add one to get started.</div>}
      </div>

      <AnimatePresence>
        {open && (
          <AccountDialog
            account={editingAccount}
            onClose={() => { setOpen(false); setEditingAccount(null); }}
            onSaved={() => { load(); setOpen(false); setEditingAccount(null); }}
          />
        )}
        {transferOpen && (
          <TransferDialog
            accounts={list}
            onClose={() => setTransferOpen(false)}
            onSaved={() => { load(); setTransferOpen(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TransferDialog({ accounts, onClose, onSaved }: { accounts: any[]; onClose: () => void; onSaved: () => void }) {
  const [fromId, setFromId] = useState(accounts[0]?.id || "");
  const [toId, setToId] = useState(accounts[1]?.id || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("Transfer");
  const [loading, setLoading] = useState(false);

  const transfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromId === toId) {
      toast.error("Source and destination accounts must be different");
      return;
    }
    const val = Number(amount);
    if (!val || val <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const fromAcc = accounts.find((a) => a.id === fromId);
    const toAcc = accounts.find((a) => a.id === toId);
    if (!fromAcc || !toAcc) return;

    setLoading(true);
    const [resFrom, resTo] = await Promise.all([
      supabase.from("accounts").update({ balance: Number(fromAcc.balance) - val }).eq("id", fromId),
      supabase.from("accounts").update({ balance: Number(toAcc.balance) + val }).eq("id", toId),
    ]);
    setLoading(false);

    if (resFrom.error || resTo.error) {
      toast.error(resFrom.error?.message || resTo.error?.message || "Transfer failed");
      return;
    }

    toast.success(`Transferred ${formatMoney(val)} from ${fromAcc.name} to ${toAcc.name}`);
    onSaved();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={transfer} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <h2 className="mb-4 font-display text-xl font-bold flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-primary" /> Transfer between accounts
        </h2>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">From Account</span>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatMoney(Number(a.balance))})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">To Account</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatMoney(Number(a.balance))})</option>)}
            </select>
          </label>
          <Field label="Amount" type="number" step="0.01" value={amount} onChange={setAmount} required placeholder="0.00" autoFocus />
          <Field label="Note (optional)" value={note} onChange={setNote} placeholder="ATM withdrawal, Savings deposit, etc." />
        </div>
        <button disabled={loading} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-warm)" }}>
          {loading ? "Transferring…" : "Complete Transfer"}
        </button>
      </motion.form>
    </motion.div>
  );
}

function AccountDialog({ account, onClose, onSaved }: { account?: any | null; onClose: () => void; onSaved: () => void }) {
  const { profile, user } = useAuth();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState(account?.type ?? "bank");
  const [balance, setBalance] = useState(account ? String(account.balance) : "0");
  const [currency, setCurrency] = useState(account?.currency ?? "INR");
  const [loading, setLoading] = useState(false);

  const isEdit = !!account;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id) {
      toast.error("Please set up your household first in the Family tab.");
      return;
    }
    if (!user) return;
    setLoading(true);

    if (isEdit) {
      const { error } = await supabase.from("accounts").update({
        name: name.trim(),
        type: type as any,
        balance: Number(balance),
        currency,
      }).eq("id", account.id);
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Account updated");
    } else {
      const { error } = await supabase.from("accounts").insert({
        user_id: user.id,
        family_id: profile.family_id,
        name: name.trim(),
        type: type as any,
        balance: Number(balance),
        currency,
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Account added");
    }
    onSaved();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <h2 className="mb-4 font-display text-xl font-bold">{isEdit ? "Edit account" : "Add account"}</h2>
        <div className="space-y-3">
          <Field label="Account name" value={name} onChange={setName} required placeholder="Chase Checking" autoFocus />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label={isEdit ? "Current balance" : "Starting balance"} type="number" step="0.01" value={balance} onChange={setBalance} />
            <Field label="Currency" value={currency} onChange={(v: string) => setCurrency(v.toUpperCase())} />
          </div>
        </div>
        <button disabled={loading} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-warm)" }}>
          {loading ? "Saving…" : isEdit ? "Update account" : "Add account"}
        </button>
      </motion.form>
    </motion.div>
  );
}

function Field({ label, value, onChange, ...rest }: any) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span><input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></label>;
}

