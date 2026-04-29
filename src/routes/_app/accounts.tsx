import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Wallet, CreditCard, Banknote, Smartphone, Trash2 } from "lucide-react";
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
  const { profile, user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!profile?.family_id) return;
    const [a, m] = await Promise.all([
      supabase.from("accounts").select("*"),
      supabase.from("profiles").select("id,full_name").eq("family_id", profile.family_id),
    ]);
    setList(a.data ?? []); setMembers(m.data ?? []);
  };
  useEffect(() => { load(); }, [profile?.family_id]);
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));

  const del = async (id: string) => {
    if (!confirm("Delete this account?")) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Accounts</h1>
          <p className="text-muted-foreground">Bank accounts, cash, cards & wallets.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
          <Plus className="h-4 w-4" /> Add account
        </button>
      </header>

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
                {a.user_id === user?.id && <button onClick={() => del(a.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <div className="mt-4 text-sm text-muted-foreground">{a.name}</div>
              <div className="font-display text-2xl font-bold">{formatMoney(Number(a.balance), a.currency)}</div>
              <div className="mt-2 text-xs text-muted-foreground">{memberMap[a.user_id]?.full_name} · {a.type}</div>
            </motion.div>
          );
        })}
        {list.length === 0 && <div className="col-span-full rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No accounts yet — add one to get started.</div>}
      </div>

      <AnimatePresence>{open && <AccountDialog onClose={() => setOpen(false)} onSaved={() => { load(); setOpen(false); }} />}</AnimatePresence>
    </div>
  );
}

function AccountDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile, user } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [balance, setBalance] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id || !user) return;
    setLoading(true);
    const { error } = await supabase.from("accounts").insert({
      user_id: user.id, family_id: profile.family_id, name, type: type as any, balance: Number(balance), currency,
    });
    if (error) { toast.error(error.message); setLoading(false); return; }
    toast.success("Account added"); onSaved();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <h2 className="mb-4 font-display text-xl font-bold">Add account</h2>
        <div className="space-y-3">
          <Field label="Name" value={name} onChange={setName} required placeholder="Chase Checking" />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starting balance" type="number" step="0.01" value={balance} onChange={setBalance} />
            <Field label="Currency" value={currency} onChange={(v) => setCurrency(v.toUpperCase())} />
          </div>
        </div>
        <button disabled={loading} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>{loading ? "Saving…" : "Add account"}</button>
      </motion.form>
    </motion.div>
  );
}
function Field({ label, value, onChange, ...rest }: any) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span><input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></label>;
}
