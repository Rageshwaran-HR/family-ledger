import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/tags")({ component: Tags });

const COLORS = ["#e76f51", "#a98467", "#2a9d8f", "#e9c46a", "#ef476f", "#9d4edd", "#06a77d", "#6c757d", "#5b8def", "#f4a261"];

function Tags() {
  const { profile, isAdmin } = useAuth();
  const [tags, setTags] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const load = async () => {
    const { data } = await supabase.from("tags").select("*").order("name");
    setTags(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.family_id || !name.trim()) return;
    const { error } = await supabase.from("tags").insert({ family_id: profile.family_id, name: name.trim(), color, icon: "Tag" });
    if (error) { toast.error(error.message); return; }
    setName(""); toast.success("Tag added"); load();
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Categories & tags</h1>
        <p className="text-muted-foreground">Organize transactions with custom tags.</p>
      </header>

      <form onSubmit={add} className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[200px]">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">New tag name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Groceries" className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Color</span>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`h-8 w-8 rounded-full ring-offset-2 ${color === c ? "ring-2 ring-foreground" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </div>
          <button className="rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}><Plus className="inline h-4 w-4" /> Add</button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <div key={t.id} className="group flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium" style={{ background: t.color + "22", color: t.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
            {t.name}
            {t.is_default && <span className="text-[10px] uppercase tracking-wider opacity-60">default</span>}
            {isAdmin && !t.is_default && <button onClick={() => del(t.id)} className="opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}
