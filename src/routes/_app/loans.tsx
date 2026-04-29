import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, X, CheckCircle2, Trash2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_app/loans")({ component: Loans });

interface Loan { id: string; name: string; principal: number; remaining_balance: number; interest_rate_monthly: number; tenure_months: number; start_date: string; status: "active" | "closed"; user_id: string; notes: string | null; }

function Loans() {
  const { profile, user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState<Loan | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    if (!profile?.family_id) return;
    const [l, p, m] = await Promise.all([
      supabase.from("loans").select("*").order("created_at", { ascending: false }),
      supabase.from("loan_payments").select("*").order("paid_on", { ascending: false }),
      supabase.from("profiles").select("id,full_name").eq("family_id", profile.family_id),
    ]);
    setLoans((l.data as Loan[]) ?? []); setPayments(p.data ?? []); setMembers(m.data ?? []);
  };
  useEffect(() => { load(); }, [profile?.family_id]);

  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));

  const close = async (id: string) => {
    const { error } = await supabase.from("loans").update({ status: "closed", remaining_balance: 0 }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Loan closed 🎉"); load(); }
  };
  const del = async (id: string) => {
    if (!confirm("Delete this loan and all its payments?")) return;
    const { error } = await supabase.from("loans").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const totalDebt = loans.filter((l) => l.status === "active").reduce((s, l) => s + Number(l.remaining_balance), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Loans</h1>
          <p className="text-muted-foreground">Track loans, interest and payments.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
          <Plus className="h-4 w-4" /> New loan
        </button>
      </header>

      <div className="rounded-3xl border border-border p-5 shadow-[var(--shadow-soft)]" style={{ background: "var(--gradient-warm)", color: "white" }}>
        <div className="text-sm opacity-90">Total active debt</div>
        <div className="font-display text-4xl font-bold">{formatMoney(totalDebt)}</div>
        <div className="mt-1 text-sm opacity-90">{loans.filter((l) => l.status === "active").length} active loan(s)</div>
      </div>

      <div className="space-y-3">
        {loans.map((l) => {
          const monthsElapsed = Math.max(0, Math.floor((Date.now() - new Date(l.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)));
          const remainingMonths = Math.max(0, l.tenure_months - monthsElapsed);
          const progress = l.principal > 0 ? Math.min(100, ((Number(l.principal) - Number(l.remaining_balance)) / Number(l.principal)) * 100) : 0;
          const loanPays = payments.filter((p) => p.loan_id === l.id);
          const isOpen = expanded === l.id;
          return (
            <motion.div key={l.id} layout className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg font-semibold">{l.name}</h3>
                    {l.status === "closed" ? <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-semibold text-success">Closed</span> : <span className="rounded-full bg-warning/30 px-2 py-0.5 text-xs font-semibold text-warning-foreground">Active</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{memberMap[l.user_id]?.full_name} · started {formatDate(l.start_date)} · {l.interest_rate_monthly}% / mo</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Remaining</div>
                  <div className="font-display text-2xl font-bold">{formatMoney(Number(l.remaining_balance))}</div>
                  <div className="text-xs text-muted-foreground">of {formatMoney(Number(l.principal))}</div>
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "var(--gradient-warm)" }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{progress.toFixed(0)}% paid</span><span>{remainingMonths} mo left</span></div>

              <div className="mt-4 flex flex-wrap gap-2">
                {l.status === "active" && l.user_id === user?.id && (
                  <>
                    <button onClick={() => setPaying(l)} className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">Add payment</button>
                    <button onClick={() => close(l.id)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-4 py-1.5 text-sm hover:bg-secondary"><CheckCircle2 className="h-4 w-4 text-success" /> Mark closed</button>
                  </>
                )}
                <button onClick={() => setExpanded(isOpen ? null : l.id)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-4 py-1.5 text-sm hover:bg-secondary">
                  <ChevronDown className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} /> History ({loanPays.length})
                </button>
                {l.user_id === user?.id && <button onClick={() => del(l.id)} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
              </div>

              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-4 rounded-2xl bg-secondary p-3">
                      {loanPays.length === 0 ? <div className="text-center text-sm text-muted-foreground py-3">No payments yet.</div> : (
                        <ul className="divide-y divide-border">
                          {loanPays.map((p) => (
                            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                              <span>{formatDate(p.paid_on)} {p.note && <span className="text-muted-foreground">· {p.note}</span>}</span>
                              <span className="text-right">
                                <div className="font-semibold">{formatMoney(Number(p.amount))}</div>
                                <div className="text-xs text-muted-foreground">{formatMoney(Number(p.principal_paid))} principal · {formatMoney(Number(p.interest_paid))} interest</div>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
        {loans.length === 0 && <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No loans tracked yet.</div>}
      </div>

      <AnimatePresence>{open && <LoanDialog onClose={() => setOpen(false)} onSaved={() => { load(); setOpen(false); }} />}</AnimatePresence>
      <AnimatePresence>{paying && <PaymentDialog loan={paying} onClose={() => setPaying(null)} onSaved={() => { load(); setPaying(null); }} />}</AnimatePresence>
    </div>
  );
}

function LoanDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile, user } = useAuth();
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("1.0");
  const [tenure, setTenure] = useState("12");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id || !user) return;
    setLoading(true);
    const p = Number(principal);
    const { error } = await supabase.from("loans").insert({
      user_id: user.id, family_id: profile.family_id, name, principal: p, remaining_balance: p,
      interest_rate_monthly: Number(rate), tenure_months: Number(tenure), start_date: date,
    });
    if (error) { toast.error(error.message); setLoading(false); return; }
    toast.success("Loan added"); onSaved();
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">New loan</h2><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button></div>
        <div className="space-y-3">
          <Field label="Name" value={name} onChange={setName} required placeholder="Car loan" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Principal" type="number" step="0.01" value={principal} onChange={setPrincipal} required />
            <Field label="Interest % / month" type="number" step="0.01" value={rate} onChange={setRate} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tenure (months)" type="number" value={tenure} onChange={setTenure} required />
            <Field label="Start date" type="date" value={date} onChange={setDate} required />
          </div>
        </div>
        <button disabled={loading} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>{loading ? "Saving…" : "Add loan"}</button>
      </motion.form>
    </motion.div>
  );
}

function PaymentDialog({ loan, onClose, onSaved }: { loan: Loan; onClose: () => void; onSaved: () => void }) {
  const { profile, user } = useAuth();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  // Interest = remaining_balance * (monthly rate %)
  const interestDue = Number(loan.remaining_balance) * (Number(loan.interest_rate_monthly) / 100);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id || !user) return;
    setLoading(true);
    const amt = Number(amount);
    const interestPaid = Math.min(amt, interestDue);
    const principalPaid = Math.max(0, amt - interestPaid);
    const newBalance = Math.max(0, Number(loan.remaining_balance) - principalPaid);

    const { error } = await supabase.from("loan_payments").insert({
      loan_id: loan.id, user_id: user.id, family_id: profile.family_id,
      amount: amt, principal_paid: principalPaid, interest_paid: interestPaid, paid_on: date, note: note || null,
    });
    if (error) { toast.error(error.message); setLoading(false); return; }

    const { error: e2 } = await supabase.from("loans").update({ remaining_balance: newBalance, status: newBalance === 0 ? "closed" : "active" }).eq("id", loan.id);
    if (e2) { toast.error(e2.message); setLoading(false); return; }

    toast.success(newBalance === 0 ? "Loan paid off! 🎉" : "Payment recorded"); onSaved();
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <h2 className="font-display text-xl font-bold">Add payment</h2>
        <p className="mt-1 text-sm text-muted-foreground">{loan.name} · Interest due this period: <strong>{formatMoney(interestDue)}</strong></p>
        <div className="mt-4 space-y-3">
          <Field label="Payment amount" type="number" step="0.01" value={amount} onChange={setAmount} required />
          <Field label="Date" type="date" value={date} onChange={setDate} required />
          <Field label="Note (optional)" value={note} onChange={setNote} />
        </div>
        <button disabled={loading} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>{loading ? "Saving…" : "Record payment"}</button>
      </motion.form>
    </motion.div>
  );
}

function Field({ label, value, onChange, ...rest }: any) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span><input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></label>;
}
