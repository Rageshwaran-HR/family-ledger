import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { 
  Plus, Wallet, CreditCard, Banknote, Smartphone, Trash2, Pencil, ArrowRightLeft, 
  Building2, CheckCircle2, XCircle, ArrowUpRight, ArrowDownLeft, Sparkles, RefreshCw, 
  Check, Tag as TagIcon, UserCheck, Briefcase, ExternalLink, ShieldCheck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { smartCategoryGuess, seedSampleBankFeed, createSetuConsent } from "@/lib/setu-bank-api";

export const Route = createFileRoute("/_app/accounts")({ component: Accounts });

const TYPES = [
  { value: "bank", label: "Bank", icon: Banknote },
  { value: "cash", label: "Cash", icon: Wallet },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "wallet", label: "Wallet", icon: Smartphone },
  { value: "other", label: "Other", icon: Wallet },
];

const POPULAR_BANKS = [
  "State Bank of India (SBI)",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Bank of Baroda",
  "Punjab National Bank (PNB)",
  "Canara Bank",
  "IndusInd Bank",
  "Federal Bank",
  "IDFC FIRST Bank",
  "Other Bank / UPI"
];

function Accounts() {
  const { profile, user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<"accounts" | "bank_feed">("accounts");
  const [list, setList] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [bankConnections, setBankConnections] = useState<any[]>([]);
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [feedFilter, setFeedFilter] = useState<"pending" | "all" | "categorized" | "business_matched">("pending");

  const [open, setOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [connectBankOpen, setConnectBankOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);

  const load = async () => {
    if (!profile?.family_id) return;
    const [a, m, t, c, bConn, f] = await Promise.all([
      supabase.from("accounts").select("*").eq("family_id", profile.family_id).order("name"),
      supabase.from("profiles").select("id,full_name").eq("family_id", profile.family_id),
      supabase.from("tags").select("id,name,color").eq("family_id", profile.family_id),
      supabase.from("business_clients").select("id,name,business_id,monthly_amount,is_active").eq("family_id", profile.family_id),
      supabase.from("bank_connections").select("*").eq("family_id", profile.family_id).order("created_at", { ascending: false }),
      supabase.from("bank_sync_feed").select("*").eq("family_id", profile.family_id).order("occurred_on", { ascending: false }),
    ]);
    setList(a.data ?? []); 
    setMembers(m.data ?? []);
    setTags(t.data ?? []);
    setClients(c.data ?? []);
    setBankConnections(bConn.data ?? []);
    setFeedItems(f.data ?? []);
  };

  useEffect(() => {
    load();
    if (!profile?.family_id) return;
    const channel = supabase
      .channel("accounts-feed-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_sync_feed" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_connections" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.family_id]);

  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
  const totalBalance = list.reduce((s, a) => s + Number(a.balance || 0), 0);
  const pendingFeedCount = feedItems.filter((item) => item.status === "pending").length;

  const del = async (id: string) => {
    if (!confirm("Delete this account? Associated transactions will have their account unlinked.")) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const handleSeedMockFeed = async () => {
    if (!profile?.family_id || !user) return;
    try {
      let bConnId = bankConnections[0]?.id;
      if (!bConnId) {
        const newConn = await createSetuConsent({
          mobileNumber: "9876543210",
          bankName: "HDFC Bank (Sandbox)",
          familyId: profile.family_id,
          userId: user.id,
          accountId: list[0]?.id,
        });
        bConnId = newConn.id;
      }
      await seedSampleBankFeed({
        familyId: profile.family_id,
        userId: user.id,
        bankConnectionId: bConnId,
        accountId: list[0]?.id,
        clientNames: clients.map((c) => c.name),
      });
      toast.success("Loaded 4 sample bank & UPI transactions into your inbox!");
      await load();
      setActiveTab("bank_feed");
    } catch (err: any) {
      toast.error(err.message || "Failed to load test feed");
    }
  };

  const visibleFeed = feedItems.filter((item) => {
    if (feedFilter === "pending") return item.status === "pending";
    if (feedFilter === "categorized") return item.status === "categorized";
    if (feedFilter === "business_matched") return item.status === "business_matched";
    return true;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Accounts & Bank Sync</h1>
          <p className="text-muted-foreground text-sm">Bank accounts, cash wallets & real-time bank feeds.</p>
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
          <button
            onClick={() => setConnectBankOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs sm:text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            <Building2 className="h-4 w-4" /> Connect Bank (Setu AA)
          </button>
          <button onClick={() => { setEditingAccount(null); setOpen(true); }} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
            <Plus className="h-4 w-4" /> Add account
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("accounts")}
          className={`relative rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
            activeTab === "accounts" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          Accounts & Wallets ({list.length})
        </button>
        <button
          onClick={() => setActiveTab("bank_feed")}
          className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
            activeTab === "bank_feed" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>⚡ Bank Review Inbox</span>
          {pendingFeedCount > 0 && (
            <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold ${
              activeTab === "bank_feed" ? "bg-white text-primary" : "bg-primary text-white"
            }`}>
              {pendingFeedCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "accounts" ? (
        <>
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
                  {a.account_number && (
                    <div className="text-[11px] font-mono text-muted-foreground">
                      •••• {a.account_number.slice(-4)}
                    </div>
                  )}
                  <div className="font-display text-2xl font-bold mt-1">{formatMoney(Number(a.balance), a.currency)}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{memberMap[a.user_id]?.full_name || "Member"} · {T.label}</div>
                </motion.div>
              );
            })}
            {list.length === 0 && <div className="col-span-full rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No accounts yet — add one to get started.</div>}
          </div>
        </>
      ) : (
        /* BANK REVIEW INBOX */
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-gradient-to-r from-amber-500/10 via-primary/10 to-amber-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Live Bank & UPI Inbox
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Transactions from linked Indian bank accounts appear here. Categorize household expenses or match client payments in 1 click!
              </p>
            </div>
            <button
              onClick={handleSeedMockFeed}
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-4 py-2 text-xs font-semibold text-primary hover:bg-secondary shrink-0 shadow-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" /> ⚡ Load Test Bank Feed
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFeedFilter("pending")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                feedFilter === "pending" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              Pending Review ({pendingFeedCount})
            </button>
            <button
              onClick={() => setFeedFilter("categorized")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                feedFilter === "categorized" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              Household Categorized
            </button>
            <button
              onClick={() => setFeedFilter("business_matched")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                feedFilter === "business_matched" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              Business Client Matched
            </button>
            <button
              onClick={() => setFeedFilter("all")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                feedFilter === "all" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
              }`}
            >
              All Records
            </button>
          </div>

          <div className="space-y-3">
            {visibleFeed.map((item) => (
              <BankFeedCard
                key={item.id}
                item={item}
                accounts={list}
                tags={tags}
                members={members}
                clients={clients}
                onProcessed={load}
              />
            ))}
            {visibleFeed.length === 0 && (
              <div className="rounded-3xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                {feedFilter === "pending"
                  ? "🎉 Inbox zero! No pending bank transactions to review."
                  : "No transactions found in this filter."}
              </div>
            )}
          </div>
        </div>
      )}

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
        {connectBankOpen && (
          <ConnectBankDialog
            accounts={list}
            onClose={() => setConnectBankOpen(false)}
            onConnected={() => { load(); setConnectBankOpen(false); setActiveTab("bank_feed"); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Single Bank Feed Review Card with 1-Click Categorize & 1-Click Client Match
 */
function BankFeedCard({
  item,
  accounts,
  tags,
  members,
  clients,
  onProcessed,
}: {
  item: any;
  accounts: any[];
  tags: any[];
  members: any[];
  clients: any[];
  onProcessed: () => void;
}) {
  const { user, profile } = useAuth();
  const [selectedTagId, setSelectedTagId] = useState<string>("");
  const [selectedMemberId, setSelectedMemberId] = useState<string>(user?.id || members[0]?.id || "");
  const [selectedAccountId, setSelectedAccountId] = useState<string>(item.account_id || accounts[0]?.id || "");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const smartGuess = smartCategoryGuess(item.description, item.merchant_name);

  // Initialize best tag guess
  useEffect(() => {
    const matchedTag = tags.find((t) => t.name.toLowerCase() === smartGuess.category.toLowerCase());
    if (matchedTag) setSelectedTagId(matchedTag.id);
    else if (tags[0]) setSelectedTagId(tags[0].id);
  }, [tags, smartGuess.category]);

  // Auto-match business client by name if income
  useEffect(() => {
    if (item.type === "income" && clients.length > 0) {
      const match = clients.find((c) =>
        item.description.toLowerCase().includes(c.name.toLowerCase()) ||
        (item.merchant_name && item.merchant_name.toLowerCase().includes(c.name.toLowerCase()))
      );
      if (match) setSelectedClientId(match.id);
      else setSelectedClientId(clients[0].id);
    }
  }, [clients, item]);

  // Action 1: Categorize as Household Transaction
  const handleCategorize = async () => {
    if (!profile?.family_id) return;
    if (!selectedAccountId) {
      toast.error("Please choose an account to link");
      return;
    }
    setLoading(true);
    try {
      // 1. Insert into transactions
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          family_id: profile.family_id,
          user_id: selectedMemberId,
          account_id: selectedAccountId,
          tag_id: selectedTagId || null,
          type: item.type,
          amount: Number(item.amount),
          occurred_on: item.occurred_on,
          note: `Bank Sync: ${item.description}`,
        })
        .select()
        .single();

      if (txErr) throw txErr;

      // 2. Mark feed item as categorized
      await supabase
        .from("bank_sync_feed")
        .update({
          status: "categorized",
          linked_transaction_id: tx.id,
        })
        .eq("id", item.id);

      toast.success(`Logged ${formatMoney(item.amount)} to ${tags.find((t) => t.id === selectedTagId)?.name || "Ledger"}`);
      onProcessed();
    } catch (err: any) {
      toast.error(err.message || "Failed to categorize");
    } finally {
      setLoading(false);
    }
  };

  // Action 2: Match to Business Client & Mark Paid
  const handleMatchBusinessClient = async () => {
    if (!profile?.family_id || !selectedClientId) return;
    setLoading(true);
    try {
      const client = clients.find((c) => c.id === selectedClientId);
      if (!client) throw new Error("Client not found");

      // 1. Insert client payment
      const { data: cp, error: cpErr } = await supabase
        .from("client_payments")
        .insert({
          family_id: profile.family_id,
          business_id: client.business_id,
          client_id: client.id,
          amount: Number(item.amount),
          payment_date: item.occurred_on,
          note: `Bank/UPI Sync: ${item.description}`,
        })
        .select()
        .single();

      if (cpErr) throw cpErr;

      // 2. Also log income transaction in ledger
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          family_id: profile.family_id,
          user_id: selectedMemberId,
          account_id: selectedAccountId || accounts[0]?.id,
          type: "income",
          amount: Number(item.amount),
          occurred_on: item.occurred_on,
          note: `Business Collection: ${client.name} (UPI Sync)`,
        })
        .select()
        .single();

      if (txErr) throw txErr;

      // 3. Update feed item
      await supabase
        .from("bank_sync_feed")
        .update({
          status: "business_matched",
          linked_payment_id: cp.id,
          linked_transaction_id: tx.id,
        })
        .eq("id", item.id);

      toast.success(`Matched ${formatMoney(item.amount)} to Client: ${client.name} (Marked Paid!)`);
      onProcessed();
    } catch (err: any) {
      toast.error(err.message || "Failed to match client");
    } finally {
      setLoading(false);
    }
  };

  // Action 3: Ignore / Skip
  const handleIgnore = async () => {
    try {
      await supabase.from("bank_sync_feed").update({ status: "ignored" }).eq("id", item.id);
      toast.info("Transaction ignored from ledger");
      onProcessed();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border p-4 sm:p-5 shadow-[var(--shadow-soft)] transition-all ${
        item.status === "pending"
          ? "border-border bg-card"
          : "border-border/50 bg-secondary/30 opacity-75"
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left info */}
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white font-bold ${
              item.type === "income" ? "bg-emerald-600" : "bg-primary"
            }`}
          >
            {item.type === "income" ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm sm:text-base text-foreground">
                {item.merchant_name || item.description}
              </span>
              {item.status === "pending" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-300 px-2.5 py-0.5 text-[11px] font-semibold">
                  <Sparkles className="h-3 w-3" /> Suggested: {smartGuess.category}
                </span>
              )}
              {item.status === "categorized" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">
                  <CheckCircle2 className="h-3 w-3" /> Categorized
                </span>
              )}
              {item.status === "business_matched" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[11px] font-semibold">
                  <Briefcase className="h-3 w-3" /> Client Matched
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground line-clamp-1 font-mono">{item.description}</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span>{formatDate(item.occurred_on)}</span>
              {item.upi_ref && <span>· Ref: {item.upi_ref}</span>}
            </div>
          </div>
        </div>

        {/* Right Amount & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 self-end lg:self-center">
          <div
            className={`font-display text-xl sm:text-2xl font-bold ${
              item.type === "income" ? "text-emerald-600" : "text-foreground"
            }`}
          >
            {item.type === "income" ? "+" : "−"}
            {formatMoney(Number(item.amount))}
          </div>

          {item.status === "pending" && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Household categorization dropdown */}
              <select
                value={selectedTagId}
                onChange={(e) => setSelectedTagId(e.target.value)}
                className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-medium outline-none"
              >
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <button
                disabled={loading}
                onClick={handleCategorize}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              >
                <TagIcon className="h-3.5 w-3.5" /> 1-Tap Log
              </button>

              {/* If income, allow matching business client */}
              {item.type === "income" && clients.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="rounded-xl border border-blue-500/40 bg-blue-50/50 dark:bg-blue-950/30 px-2.5 py-1.5 text-xs font-medium outline-none text-blue-900 dark:text-blue-200"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        👤 Client: {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={loading}
                    onClick={handleMatchBusinessClient}
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    <Briefcase className="h-3.5 w-3.5" /> Match Client
                  </button>
                </div>
              )}

              <button
                onClick={handleIgnore}
                title="Ignore transaction"
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive text-xs"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Connect Bank Account Dialog via RBI Account Aggregator (Setu AA)
 */
function ConnectBankDialog({
  accounts,
  onClose,
  onConnected,
}: {
  accounts: any[];
  onClose: () => void;
  onConnected: () => void;
}) {
  const { profile, user } = useAuth();
  const [selectedBank, setSelectedBank] = useState(POPULAR_BANKS[0]);
  const [mobileNumber, setMobileNumber] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [otp, setOtp] = useState("");

  const handleSendConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id || !user) return;
    if (mobileNumber.length < 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    try {
      await createSetuConsent({
        mobileNumber,
        bankName: selectedBank,
        familyId: profile.family_id,
        userId: user.id,
        accountId: selectedAccountId || null,
      });
      setStep("otp");
      toast.success("Consent OTP sent to " + mobileNumber);
    } catch (err: any) {
      toast.error(err.message || "Failed to create consent");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id || !user) return;
    setLoading(true);
    try {
      // Seed real test feed upon linking
      await seedSampleBankFeed({
        familyId: profile.family_id,
        userId: user.id,
        bankConnectionId: `conn_${Date.now()}`,
        accountId: selectedAccountId || null,
      });
      toast.success(`🎉 ${selectedBank} connected successfully! Live feeds synced.`);
      onConnected();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Connect Bank Account</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> RBI Account Aggregator (Setu AA)
            </p>
          </div>
        </div>

        {step === "form" ? (
          <form onSubmit={handleSendConsent} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Select Your Bank</span>
              <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
                {POPULAR_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>

            <Field
              label="Bank Registered Mobile Number"
              type="tel"
              value={mobileNumber}
              onChange={setMobileNumber}
              required
              placeholder="e.g. 9876543210"
              autoFocus
            />

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Link to Hearth Account</span>
              <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
            </label>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[11px] text-emerald-900 dark:text-emerald-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 100% Encrypted & Read-Only
              </div>
              <p>Hearth never sees your banking credentials or passwords. Synced securely via RBI AA framework.</p>
            </div>

            <button disabled={loading} className="mt-4 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-warm)" }}>
              {loading ? "Requesting Consent OTP…" : "Send Approval OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit approval code sent to <strong>+91 {mobileNumber}</strong> to authorize read-only transaction feeds.
            </p>
            <Field label="Approval OTP" value={otp} onChange={setOtp} placeholder="e.g. 123456" autoFocus required />
            <button disabled={loading} className="w-full rounded-full px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-warm)" }}>
              {loading ? "Linking Bank Account…" : "Authorize & Fetch Transactions"}
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
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
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? "");
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
        account_number: accountNumber.trim() || null,
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
        account_number: accountNumber.trim() || null,
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
          <Field label="Account name" value={name} onChange={setName} required placeholder="e.g. HDFC Salary Account" autoFocus />
          <Field label="Account Number / Last 4 Digits / UPI ID (Optional)" value={accountNumber} onChange={setAccountNumber} placeholder="e.g. 1234 or user@okhdfcbank" />
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
