import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>): { mode: "signin" | "signup"; token?: string } => {
    const out: { mode: "signin" | "signup"; token?: string } = {
      mode: (s.mode as string) === "signup" ? "signup" : "signin",
    };
    if (typeof s.token === "string") out.token = s.token;
    return out;
  },
});

function AuthPage() {
  const { mode: initialMode, token } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(token ? "signup" : initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user && !token) navigate({ to: "/dashboard" });
    if (user && token) {
      (async () => {
        const { error } = await supabase.rpc("accept_invitation", { _token: token });
        if (error) toast.error(error.message);
        else toast.success("You've joined the family!");
        navigate({ to: "/dashboard" });
      })();
    }
  }, [user, navigate, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.session) {
          if (token) {
            const { error: invErr } = await supabase.rpc("accept_invitation", { _token: token });
            if (invErr) throw invErr;
            toast.success("You've joined the family!");
          } else {
            const { error: famErr } = await supabase.rpc("create_family_with_admin", { _name: familyName || `${fullName || "My"} Family` });
            if (famErr) throw famErr;
            toast.success("Welcome! Your family is ready.");
          }
          navigate({ to: "/dashboard" });
        } else {
          toast.success("Check your email to confirm your account.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        // useEffect will handle invitation acceptance if token present
        if (!token) navigate({ to: "/dashboard" });
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 py-12" style={{ background: "var(--gradient-soft)" }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-elevated)]">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl text-2xl text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>♡</div>
          <h1 className="mt-4 font-display text-3xl font-bold">{token ? "Join your family" : mode === "signup" ? "Create your family" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {token ? "You've been invited! Create an account or sign in to join." : mode === "signup" ? "Start tracking your family finances together." : "Sign in to your Hearth account."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && !token && (
            <>
              <Field label="Your name" value={fullName} onChange={setFullName} placeholder="Jamie Smith" required />
              <Field label="Family name" value={familyName} onChange={setFamilyName} placeholder="The Smiths" required />
            </>
          )}
          {mode === "signup" && token && (
            <Field label="Your name" value={fullName} onChange={setFullName} placeholder="Jamie Smith" required />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" required minLength={6} />
          <button disabled={loading} type="submit"
            className="mt-2 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-soft)] disabled:opacity-60"
            style={{ background: "var(--gradient-warm)" }}>
            {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account?" : "New to Hearth?"}{" "}
          <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="font-semibold text-primary hover:underline">
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
      </motion.div>
    </div>
  );
}

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
    </label>
  );
}
