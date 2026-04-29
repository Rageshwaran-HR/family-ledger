import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Bell, Check, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_app/reminders")({ component: Reminders });

function Reminders() {
  const { profile, user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("reminders").select("*").order("due_date");
    setList(data ?? []);
  };
  useEffect(() => { load(); }, [profile?.family_id]);

  const togglePaid = async (r: any) => {
    const { error } = await supabase.from("reminders").update({ is_paid: !r.is_paid }).eq("id", r.id);
    if (error) toast.error(error.message); else load();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("reminders").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const upcoming = list.filter((r) => !r.is_paid);
  const done = list.filter((r) => r.is_paid);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Reminders</h1>
          <p className="text-muted-foreground">Bill payments and loan dues — never miss one.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
          <Plus className="h-4 w-4" /> Add reminder
        </button>
      </header>

      <Section title="Upcoming">
        {upcoming.length === 0 ? <Empty msg="All caught up! 🌿" /> : (
          <ul className="divide-y divide-border">
            {upcoming.map((r) => {
              const due = new Date(r.due_date); const overdue = due < today;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-10 w-10 place-items-center rounded-xl ${overdue ? "bg-destructive/15 text-destructive" : "bg-accent text-accent-foreground"}`}><Bell className="h-4 w-4" /></div>
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">Due {formatDate(r.due_date)} {overdue && "· overdue"} {r.recurrence !== "none" && `· ${r.recurrence}`}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.amount && <span className="font-semibold">{formatMoney(Number(r.amount))}</span>}
                    {r.user_id === user?.id && <>
                      <button onClick={() => togglePaid(r)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary text-success"><Check className="h-4 w-4" /></button>
                      <button onClick={() => del(r.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {done.length > 0 && (
        <Section title="Done">
          <ul className="divide-y divide-border opacity-70">
            {done.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-success/15 text-success"><Check className="h-4 w-4" /></div><div><div className="font-medium line-through">{r.title}</div><div className="text-xs text-muted-foreground">{formatDate(r.due_date)}</div></div></div>
                {r.user_id === user?.id && <button onClick={() => togglePaid(r)} className="text-xs text-primary">Undo</button>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <AnimatePresence>{open && <ReminderDialog onClose={() => setOpen(false)} onSaved={() => { load(); setOpen(false); }} />}</AnimatePresence>
    </div>
  );
}

function Section({ title, children }: any) {
  return <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"><h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>{children}</section>;
}
function Empty({ msg }: any) { return <div className="grid h-24 place-items-center text-sm text-muted-foreground">{msg}</div>; }

function ReminderDialog({ onClose, onSaved }: any) {
  const { profile, user } = useAuth();
  const [title, setTitle] = useState(""); const [amount, setAmount] = useState(""); const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [rec, setRec] = useState("none"); const [loading, setLoading] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!profile?.family_id || !user) return; setLoading(true);
    const { error } = await supabase.from("reminders").insert({ user_id: user.id, family_id: profile.family_id, title, amount: amount ? Number(amount) : null, due_date: date, recurrence: rec as any });
    if (error) { toast.error(error.message); setLoading(false); return; }
    toast.success("Reminder added"); onSaved();
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">New reminder</h2><button type="button" onClick={onClose}><X className="h-4 w-4" /></button></div>
        <div className="space-y-3">
          <Field label="Title" value={title} onChange={setTitle} required placeholder="Electric bill" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (optional)" type="number" step="0.01" value={amount} onChange={setAmount} />
            <Field label="Due date" type="date" value={date} onChange={setDate} required />
          </div>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Repeat</span>
            <select value={rec} onChange={(e) => setRec(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
              {["none","daily","weekly","monthly","yearly"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <button disabled={loading} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>{loading ? "Saving…" : "Add reminder"}</button>
      </motion.form>
    </motion.div>
  );
}
function Field({ label, value, onChange, ...rest }: any) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span><input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></label>;
}
