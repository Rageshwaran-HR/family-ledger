import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Bell, Check, Trash2, X, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_app/reminders")({ component: Reminders });

interface Reminder {
  id: string;
  title: string;
  amount: number | null;
  due_date: string;
  recurrence: "none" | "daily" | "weekly" | "monthly" | "yearly";
  is_paid: boolean;
  user_id: string;
  family_id: string;
}

function getNextDueDate(currentDateStr: string, recurrence: string): string {
  const d = new Date(currentDateStr);
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  else if (recurrence === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function Reminders() {
  const { profile, user, isAdmin } = useAuth();
  const [list, setList] = useState<Reminder[]>([]);
  const [open, setOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  const load = async () => {
    const { data } = await supabase.from("reminders").select("*").order("due_date");
    setList((data as Reminder[]) ?? []);
  };

  useEffect(() => {
    load();
    if (!profile?.family_id) return;
    const channel = supabase
      .channel("reminders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.family_id]);

  const markPaid = async (r: Reminder) => {
    if (!r.is_paid && r.recurrence && r.recurrence !== "none") {
      // For recurring reminders, prompt or roll forward
      const nextDate = getNextDueDate(r.due_date, r.recurrence);
      const { error } = await supabase.from("reminders").update({
        due_date: nextDate,
        is_paid: false,
      }).eq("id", r.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success(`Marked paid! Next due date: ${formatDate(nextDate)}`);
        load();
      }
    } else {
      const { error } = await supabase.from("reminders").update({ is_paid: !r.is_paid }).eq("id", r.id);
      if (error) toast.error(error.message); else load();
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this reminder?")) return;
    const { error } = await supabase.from("reminders").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const upcoming = list.filter((r) => !r.is_paid);
  const done = list.filter((r) => r.is_paid);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Reminders</h1>
          <p className="text-muted-foreground text-sm">Bill payments and loan dues — never miss one.</p>
        </div>
        <button onClick={() => { setEditingReminder(null); setOpen(true); }} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
          <Plus className="h-4 w-4" /> Add reminder
        </button>
      </header>

      <Section title="Upcoming">
        {upcoming.length === 0 ? <Empty msg="All caught up! 🌿" /> : (
          <ul className="divide-y divide-border">
            {upcoming.map((r) => {
              const due = new Date(r.due_date); const overdue = due < today;
              return (
                <li key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-xl ${overdue ? "bg-destructive/15 text-destructive" : "bg-accent text-accent-foreground"}`}><Bell className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm sm:text-base truncate">{r.title}</div>
                      <div className="text-[11px] sm:text-xs text-muted-foreground">Due {formatDate(r.due_date)} {overdue && <span className="font-semibold text-destructive">· overdue</span>} {r.recurrence !== "none" && `· repeats ${r.recurrence}`}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 pl-12 sm:pl-0">
                    {r.amount && <span className="font-semibold text-sm sm:text-base">{formatMoney(Number(r.amount))}</span>}
                    {(r.user_id === user?.id || isAdmin) && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => markPaid(r)} title="Mark as paid" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary text-success">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => { setEditingReminder(r); setOpen(true); }} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => del(r.id)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
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
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-xl bg-success/15 text-success"><Check className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm sm:text-base line-through truncate">{r.title}</div>
                    <div className="text-[11px] sm:text-xs text-muted-foreground">{formatDate(r.due_date)}</div>
                  </div>
                </div>
                {(r.user_id === user?.id || isAdmin) && (
                  <div className="flex items-center justify-between sm:justify-end gap-2 pl-12 sm:pl-0">
                    <button onClick={() => markPaid(r)} className="text-xs text-primary font-medium hover:underline">Undo</button>
                    <button onClick={() => del(r.id)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <AnimatePresence>
        {open && (
          <ReminderDialog
            reminder={editingReminder}
            onClose={() => { setOpen(false); setEditingReminder(null); }}
            onSaved={() => { load(); setOpen(false); setEditingReminder(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, children }: any) {
  return <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"><h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>{children}</section>;
}
function Empty({ msg }: any) { return <div className="grid h-24 place-items-center text-sm text-muted-foreground">{msg}</div>; }

function ReminderDialog({ reminder, onClose, onSaved }: { reminder?: Reminder | null; onClose: () => void; onSaved: () => void }) {
  const { profile, user } = useAuth();
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [amount, setAmount] = useState(reminder?.amount ? String(reminder.amount) : "");
  const [date, setDate] = useState(reminder?.due_date ?? new Date().toISOString().slice(0,10));
  const [rec, setRec] = useState<string>(reminder?.recurrence ?? "none");
  const [loading, setLoading] = useState(false);

  const isEdit = !!reminder;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id) {
      toast.error("Please set up your household first in the Family tab.");
      return;
    }
    if (!user) return;
    setLoading(true);

    if (isEdit) {
      const { error } = await supabase.from("reminders").update({
        title: title.trim(),
        amount: amount ? Number(amount) : null,
        due_date: date,
        recurrence: rec as any,
      }).eq("id", reminder.id);
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Reminder updated");
    } else {
      const { error } = await supabase.from("reminders").insert({
        user_id: user.id,
        family_id: profile.family_id,
        title: title.trim(),
        amount: amount ? Number(amount) : null,
        due_date: date,
        recurrence: rec as any,
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Reminder added");
    }
    onSaved();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{isEdit ? "Edit reminder" : "New reminder"}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Title" value={title} onChange={setTitle} required placeholder="Electric bill, rent, etc." autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (optional)" type="number" step="0.01" value={amount} onChange={setAmount} />
            <Field label="Due date" type="date" value={date} onChange={setDate} required />
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Repeat</span>
            <select value={rec} onChange={(e) => setRec(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
              {["none","daily","weekly","monthly","yearly"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <button disabled={loading} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-warm)" }}>
          {loading ? "Saving…" : isEdit ? "Update reminder" : "Add reminder"}
        </button>
      </motion.form>
    </motion.div>
  );
}

function Field({ label, value, onChange, ...rest }: any) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span><input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" /></label>;
}
