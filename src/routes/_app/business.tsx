import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, Briefcase, ChevronDown, ChevronLeft, ChevronRight, X, CheckCircle2, AlertCircle, Clock, Pencil, FileSpreadsheet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_app/business")({ component: BusinessPage });

interface Business { id: string; name: string; description: string | null; color: string; is_active: boolean; user_id: string }
interface Client {
  id: string; business_id: string; name: string; phone: string | null; email: string | null; notes: string | null;
  plan_name: string; monthly_amount: number; billing_day: number; start_date: string; is_active: boolean; user_id: string;
}
interface Payment { id: string; client_id: string; business_id: string; period_month: string; amount: number; paid_on: string; method: string | null; note: string | null }

const COLORS = ["#e76f51", "#2a9d8f", "#e9c46a", "#9d4edd", "#ef476f", "#06a77d", "#5b8def", "#a98467"];
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const monthLabel = (k: string) => new Date(k).toLocaleDateString(undefined, { month: "long", year: "numeric" });

function BusinessPage() {
  const { profile, user, isAdmin } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [activeBiz, setActiveBiz] = useState<string | "all">("all");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [bizOpen, setBizOpen] = useState(false);
  const [editingBiz, setEditingBiz] = useState<Business | null>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [payFor, setPayFor] = useState<Client | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!profile?.family_id) return;
    setLoading(true);
    const [b, c, p, a] = await Promise.all([
      supabase.from("businesses").select("*").order("created_at"),
      supabase.from("business_clients").select("*").order("name"),
      supabase.from("client_payments").select("*").order("paid_on", { ascending: false }),
      supabase.from("accounts").select("*").order("name"),
    ]);
    setBusinesses((b.data as unknown as Business[]) ?? []);
    setClients((c.data as unknown as Client[]) ?? []);
    setPayments((p.data as unknown as Payment[]) ?? []);
    setAccounts(a.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!profile?.family_id) return;
    const channel = supabase
      .channel("business-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_payments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "business_clients" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.family_id]);

  const visibleClients = useMemo(
    () => clients.filter((c) => (activeBiz === "all" ? true : c.business_id === activeBiz)),
    [clients, activeBiz],
  );

  const paidInMonth = (clientId: string) =>
    payments.filter((p) => p.client_id === clientId && p.period_month.slice(0, 7) === month.slice(0, 7))
      .reduce((s, p) => s + Number(p.amount), 0);

  const stats = useMemo(() => {
    const active = visibleClients.filter((c) => c.is_active);
    const expected = active.reduce((s, c) => s + Number(c.monthly_amount), 0);
    let collected = 0, full = 0, partial = 0, unpaid = 0;
    active.forEach((c) => {
      const paid = paidInMonth(c.id);
      collected += paid;
      if (paid <= 0) unpaid++;
      else if (paid + 0.001 < Number(c.monthly_amount)) partial++;
      else full++;
    });
    return { expected, collected, full, partial, unpaid, count: active.length };
  }, [visibleClients, payments, month]);

  const shiftMonth = (delta: number) => {
    const d = new Date(month); d.setMonth(d.getMonth() + delta); setMonth(monthKey(d));
  };

  const exportExcel = () => {
    if (visibleClients.length === 0) {
      toast.error("No clients or payments to export");
      return;
    }
    const clientRows = visibleClients.map((c) => ({
      "Client Name": c.name,
      "Plan": c.plan_name,
      "Monthly Fee": Number(c.monthly_amount),
      "Billing Day": `Day ${c.billing_day}`,
      "Phone": c.phone || "",
      "Email": c.email || "",
      "Status": c.is_active ? "Active" : "Inactive",
      "Month Paid": paidInMonth(c.id),
    }));

    const paymentRows = payments.map((p) => {
      const c = clients.find((x) => x.id === p.client_id);
      return {
        "Date": p.paid_on,
        "Client": c?.name || "Unknown",
        "Period": p.period_month.slice(0, 7),
        "Amount": Number(p.amount),
        "Method": p.method || "",
        "Note": p.note || "",
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientRows), "Clients");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentRows), "Payment History");
    XLSX.writeFile(wb, `Business_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Business ledger exported successfully");
  };

  const delBiz = async (id: string) => {
    if (!confirm("Delete this business with all its clients and payments?")) return;
    const { error } = await supabase.from("businesses").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Business deleted"); if (activeBiz === id) setActiveBiz("all"); load(); }
  };
  const delClient = async (id: string) => {
    if (!confirm("Delete this client and their payment history?")) return;
    const { error } = await supabase.from("business_clients").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Client removed"); load(); }
  };
  const delPayment = async (id: string) => {
    const { error } = await supabase.from("client_payments").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Payment removed"); load(); }
  };
  const toggleClient = async (c: Client) => {
    const { error } = await supabase.from("business_clients").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) toast.error(error.message); else load();
  };

  const bizMap = Object.fromEntries(businesses.map((b) => [b.id, b]));

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Family business</h1>
          <p className="text-muted-foreground text-sm">Track clients, subscription plans and monthly collections.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportExcel} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs sm:text-sm font-semibold hover:bg-secondary">
            <FileSpreadsheet className="h-4 w-4" /> Export
          </button>
          <button onClick={() => { setEditingBiz(null); setBizOpen(true); }} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs sm:text-sm font-semibold hover:bg-secondary">
            <Briefcase className="h-4 w-4" /> New business
          </button>
          <button onClick={() => { setEditingClient(null); setClientOpen(true); }} disabled={businesses.length === 0} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-warm)" }}>
            <Plus className="h-4 w-4" /> Add client
          </button>
        </div>
      </header>

      {/* Business filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5">
        <button onClick={() => setActiveBiz("all")} className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap ${activeBiz === "all" ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-secondary"}`}>
          All businesses
        </button>
        {businesses.map((b) => (
          <span key={b.id} className="group inline-flex items-center shrink-0">
            <button onClick={() => setActiveBiz(b.id)} className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap ${activeBiz === b.id ? "text-primary-foreground" : "border border-border bg-card hover:bg-secondary"}`} style={activeBiz === b.id ? { background: b.color } : undefined}>
              <span className="h-2 w-2 rounded-full" style={{ background: activeBiz === b.id ? "white" : b.color }} />
              {b.name}
              <span className="opacity-70">{clients.filter((c) => c.business_id === b.id).length}</span>
            </button>
            {(b.user_id === user?.id || isAdmin) && (
              <div className="ml-1 hidden items-center group-hover:flex">
                <button onClick={() => { setEditingBiz(b); setBizOpen(true); }} title="Edit business" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-primary">
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => delBiz(b.id)} title="Delete business" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </span>
        ))}
      </div>

      {/* Month switcher */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-2">
        <button onClick={() => shiftMonth(-1)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
        <div className="font-display text-base sm:text-lg font-semibold">{monthLabel(month)}</div>
        <button onClick={() => shiftMonth(1)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-border p-5 text-white shadow-[var(--shadow-soft)]" style={{ background: "var(--gradient-warm)" }}>
          <div className="text-xs sm:text-sm opacity-90">Collected this month</div>
          <div className="font-display text-2xl sm:text-3xl font-bold">{formatMoney(stats.collected)}</div>
          <div className="text-xs opacity-90">of {formatMoney(stats.expected)} expected</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/30">
            <div className="h-full rounded-full bg-white" style={{ width: `${stats.expected > 0 ? Math.min(100, (stats.collected / stats.expected) * 100) : 0}%` }} />
          </div>
        </div>
        <StatCard label="Paid in full" value={`${stats.full}`} sub={`of ${stats.count} clients`} icon={<CheckCircle2 className="h-5 w-5 text-success" />} />
        <StatCard label="Partly paid" value={`${stats.partial}`} sub="short of plan" icon={<Clock className="h-5 w-5 text-warning-foreground" />} />
        <StatCard label="Not paid" value={`${stats.unpaid}`} sub={formatMoney(Math.max(0, stats.expected - stats.collected)) + " outstanding"} icon={<AlertCircle className="h-5 w-5 text-destructive" />} />
      </div>

      {/* Clients */}
      <div className="space-y-3">
        {visibleClients.map((c) => {
          const plan = Number(c.monthly_amount);
          const paid = paidInMonth(c.id);
          const status = !c.is_active ? "inactive" : paid <= 0 ? "unpaid" : paid + 0.001 < plan ? "partial" : "paid";
          const pct = plan > 0 ? Math.min(100, (paid / plan) * 100) : paid > 0 ? 100 : 0;
          const history = payments.filter((p) => p.client_id === c.id);
          const isOpen = expanded === c.id;
          const biz = bizMap[c.business_id];
          return (
            <motion.div key={c.id} layout className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)]">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-semibold">{c.name}</h3>
                    <StatusBadge status={status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {biz && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: biz.color }} />{biz.name} · </span>}
                    {c.plan_name} · {formatMoney(plan)}/mo · bills on day {c.billing_day}
                    {c.phone && <> · {c.phone}</>}
                  </div>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border">
                  <div className="text-xs text-muted-foreground">Paid in {monthLabel(month)}:</div>
                  <div className="text-right">
                    <span className="font-display text-xl sm:text-2xl font-bold">{formatMoney(paid)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {paid >= plan ? "Plan covered" : `${formatMoney(plan - paid)} due`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: status === "paid" ? "var(--color-success, #2a9d8f)" : "var(--gradient-warm)" }} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => setPayFor(c)} className="flex-1 sm:flex-initial rounded-full bg-primary px-4 py-1.5 text-xs sm:text-sm font-semibold text-primary-foreground text-center">Record payment</button>
                <button onClick={() => setExpanded(isOpen ? null : c.id)} className="inline-flex items-center justify-center gap-1 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs sm:text-sm hover:bg-secondary">
                  <ChevronDown className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} /> History ({history.length})
                </button>
                <button onClick={() => toggleClient(c)} className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs sm:text-sm hover:bg-secondary">
                  {c.is_active ? "Mark inactive" : "Reactivate"}
                </button>
                {(c.user_id === user?.id || isAdmin) && (
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => { setEditingClient(c); setClientOpen(true); }} title="Edit client" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-primary">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => delClient(c.id)} title="Delete client" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-4 rounded-2xl bg-secondary p-3">
                      {history.length === 0 ? (
                        <div className="py-3 text-center text-sm text-muted-foreground">No payments recorded yet.</div>
                      ) : (
                        <ul className="divide-y divide-border">
                          {history.map((p) => (
                            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                              <span>
                                <div className="font-medium">{monthLabel(p.period_month)}</div>
                                <div className="text-xs text-muted-foreground">paid {formatDate(p.paid_on)}{p.method && ` · ${p.method}`}{p.note && ` · ${p.note}`}</div>
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="font-semibold">{formatMoney(Number(p.amount))}</span>
                                {(p.user_id === user?.id || isAdmin) && (
                                  <button onClick={() => delPayment(p.id)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                                )}
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

        {!loading && businesses.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No businesses yet. Create one (e.g. “Mom’s Food”, “Finance”) to start adding clients.
          </div>
        )}
        {!loading && businesses.length > 0 && visibleClients.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No clients in this business yet.</div>
        )}
      </div>

      <AnimatePresence>
        {bizOpen && (
          <BusinessDialog
            business={editingBiz}
            onClose={() => { setBizOpen(false); setEditingBiz(null); }}
            onSaved={() => { setBizOpen(false); setEditingBiz(null); load(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {clientOpen && (
          <ClientDialog
            client={editingClient}
            businesses={businesses}
            defaultBiz={activeBiz === "all" ? businesses[0]?.id : activeBiz}
            onClose={() => { setClientOpen(false); setEditingClient(null); }}
            onSaved={() => { setClientOpen(false); setEditingClient(null); load(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {payFor && (
          <PaymentDialog
            client={payFor}
            accounts={accounts}
            month={month}
            alreadyPaid={paidInMonth(payFor.id)}
            onClose={() => setPayFor(null)}
            onSaved={() => { setPayFor(null); load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        {icon}
      </div>
      <div className="font-display text-3xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-success/20 text-success",
    partial: "bg-warning/30 text-warning-foreground",
    unpaid: "bg-destructive/15 text-destructive",
    inactive: "bg-secondary text-muted-foreground",
  };
  const label: Record<string, string> = { paid: "Paid", partial: "Partial", unpaid: "Not paid", inactive: "Inactive" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>{label[status]}</span>;
}

function Shell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-t-3xl bg-card p-6 shadow-xl sm:rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const labelCls = "mb-1 block text-xs font-semibold text-muted-foreground";
const submitCls = "w-full rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50";

function BusinessDialog({ business, onClose, onSaved }: { business?: Business | null; onClose: () => void; onSaved: () => void }) {
  const { profile, user } = useAuth();
  const [name, setName] = useState(business?.name ?? "");
  const [description, setDescription] = useState(business?.description ?? "");
  const [color, setColor] = useState(business?.color ?? COLORS[0]);
  const [saving, setSaving] = useState(false);

  const isEdit = !!business;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id) {
      toast.error("Please set up your household first in the Family tab.");
      return;
    }
    if (!user || !name.trim()) return;
    setSaving(true);

    if (isEdit) {
      const { error } = await supabase.from("businesses").update({
        name: name.trim(),
        description: description.trim() || null,
        color,
      }).eq("id", business.id);
      setSaving(false);
      if (error) toast.error(error.message); else { toast.success("Business updated"); onSaved(); }
    } else {
      const { error } = await supabase.from("businesses").insert({
        family_id: profile.family_id,
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        color,
      });
      setSaving(false);
      if (error) toast.error(error.message); else { toast.success("Business added"); onSaved(); }
    }
  };

  return (
    <Shell title={isEdit ? "Edit business" : "New business"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Business name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mom’s Food" required autoFocus />
        </div>
        <div>
          <label className={labelCls}>Description (optional)</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Home-cooked monthly meal subscriptions" />
        </div>
        <div>
          <label className={labelCls}>Colour</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`h-8 w-8 rounded-full ring-offset-2 ${color === c ? "ring-2 ring-primary" : ""}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <button type="submit" disabled={saving} className={submitCls} style={{ background: "var(--gradient-warm)" }}>
          {saving ? "Saving…" : isEdit ? "Update business" : "Create business"}
        </button>
      </form>
    </Shell>
  );
}

function ClientDialog({ client, businesses, defaultBiz, onClose, onSaved }: { client?: Client | null; businesses: Business[]; defaultBiz?: string; onClose: () => void; onSaved: () => void }) {
  const { profile, user } = useAuth();
  const [businessId, setBusinessId] = useState(client?.business_id ?? defaultBiz ?? businesses[0]?.id ?? "");
  const [name, setName] = useState(client?.name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [planName, setPlanName] = useState(client?.plan_name ?? "Monthly");
  const [amount, setAmount] = useState(client ? String(client.monthly_amount) : "");
  const [billingDay, setBillingDay] = useState(client ? String(client.billing_day) : "1");
  const [startDate, setStartDate] = useState(client?.start_date ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const isEdit = !!client;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id || !user || !businessId || !name.trim()) return;
    setSaving(true);

    if (isEdit) {
      const { error } = await supabase.from("business_clients").update({
        business_id: businessId,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        plan_name: planName.trim() || "Monthly",
        monthly_amount: Number(amount) || 0,
        billing_day: Math.min(28, Math.max(1, Number(billingDay) || 1)),
        start_date: startDate,
      }).eq("id", client.id);
      setSaving(false);
      if (error) toast.error(error.message); else { toast.success("Client updated"); onSaved(); }
    } else {
      const { error } = await supabase.from("business_clients").insert({
        family_id: profile.family_id,
        user_id: user.id,
        business_id: businessId,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        plan_name: planName.trim() || "Monthly",
        monthly_amount: Number(amount) || 0,
        billing_day: Math.min(28, Math.max(1, Number(billingDay) || 1)),
        start_date: startDate,
      });
      setSaving(false);
      if (error) toast.error(error.message); else { toast.success("Client added"); onSaved(); }
    }
  };

  return (
    <Shell title={isEdit ? "Edit client" : "Add client"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Business</label>
          <select className={inputCls} value={businessId} onChange={(e) => setBusinessId(e.target.value)} required>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Client name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Phone</label><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Plan name</label><input className={inputCls} value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Lunch daily" /></div>
          <div><label className={labelCls}>Monthly amount</label><input type="number" step="0.01" min="0" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Billing day</label><input type="number" min="1" max="28" className={inputCls} value={billingDay} onChange={(e) => setBillingDay(e.target.value)} /></div>
          <div><label className={labelCls}>Start date</label><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        </div>
        <div><label className={labelCls}>Notes</label><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <button type="submit" disabled={saving} className={submitCls} style={{ background: "var(--gradient-warm)" }}>
          {saving ? "Saving…" : isEdit ? "Update client" : "Add client"}
        </button>
      </form>
    </Shell>
  );
}

function PaymentDialog({ client, accounts, month, alreadyPaid, onClose, onSaved }: { client: Client; accounts: any[]; month: string; alreadyPaid: number; onClose: () => void; onSaved: () => void }) {
  const { profile, user } = useAuth();
  const due = Math.max(0, Number(client.monthly_amount) - alreadyPaid);
  const [amount, setAmount] = useState(String(due || client.monthly_amount));
  const [period, setPeriod] = useState(month.slice(0, 7));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Cash");
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id) {
      toast.error("Please set up your household first in the Family tab.");
      return;
    }
    if (!accountId) {
      toast.error("Please select the bank account or cash wallet to deposit this payment into.");
      return;
    }
    if (!user) return;
    setSaving(true);
    const amt = Number(amount) || 0;

    const { error } = await supabase.from("client_payments").insert({
      family_id: profile.family_id,
      user_id: user.id,
      business_id: client.business_id,
      client_id: client.id,
      period_month: `${period}-01`,
      amount: amt,
      paid_on: paidOn,
      method: method || null,
      note: note.trim() || null,
    });

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    // Always record income in the ledger linked to the selected account
    if (amt > 0) {
      await supabase.from("transactions").insert({
        user_id: user.id,
        family_id: profile.family_id,
        type: "income",
        amount: amt,
        occurred_on: paidOn,
        account_id: accountId,
        note: `Business collection: ${client.name} (${monthLabel(`${period}-01`)})${note ? ` - ${note.trim()}` : ""}`,
      });
    }

    setSaving(false);
    toast.success("Payment recorded & deposited to account");
    onSaved();
  };

  return (
    <Shell title={`Payment · ${client.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-2xl bg-secondary p-3 text-sm">
          Plan {formatMoney(Number(client.monthly_amount))}/mo · paid so far {formatMoney(alreadyPaid)} · remaining {formatMoney(due)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>For month</label><input type="month" className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)} required /></div>
          <div><label className={labelCls}>Amount</label><input type="number" step="0.01" min="0" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Paid on</label><input type="date" className={inputCls} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
          <div>
            <label className={labelCls}>Method</label>
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              {["Cash", "Bank transfer", "UPI", "Card", "Other"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        
        <div>
          <label className={labelCls}>Deposit into Account *</label>
          {accounts.length === 0 ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <strong>No accounts found:</strong> Please go to the <strong>Accounts</strong> tab and add a Bank or Cash account first.
            </div>
          ) : (
            <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatMoney(Number(a.balance))})</option>)}
            </select>
          )}
        </div>

        <div><label className={labelCls}>Note (optional)</label><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button type="submit" disabled={saving || accounts.length === 0} className={submitCls} style={{ background: "var(--gradient-warm)" }}>
          {saving ? "Saving…" : "Record payment & deposit"}
        </button>
      </form>
    </Shell>
  );
}
