import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/onboarding")({ component: Onboarding });

function Onboarding() {
  const { profile, refresh } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  if (profile?.family_id) { navigate({ to: "/dashboard" }); return null; }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.rpc("create_family_with_admin", { _name: name || "My Family" });
    if (error) { toast.error(error.message); setLoading(false); return; }
    await refresh();
    toast.success("Family created!");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-soft)]">
        <h1 className="font-display text-2xl font-bold">Set up your family</h1>
        <p className="mt-1 text-sm text-muted-foreground">Give your household a name. You can invite members next.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Smiths" required
          className="mt-5 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
        <button disabled={loading} className="mt-4 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
          {loading ? "Creating…" : "Create family"}
        </button>
      </form>
    </div>
  );
}
