import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_app/tags")({ component: Tags });

const COLORS = ["#e76f51", "#a98467", "#2a9d8f", "#e9c46a", "#ef476f", "#9d4edd", "#06a77d", "#6c757d", "#5b8def", "#f4a261"];

interface Tag {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
  family_id: string;
}

function Tags() {
  const { profile, isAdmin } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  const load = async () => {
    const { data } = await supabase.from("tags").select("*").order("name");
    setTags((data as Tag[]) ?? []);
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
    if (!confirm("Delete this tag?")) return;
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Categories & tags</h1>
        <p className="text-muted-foreground">Organize transactions with custom tags.</p>
      </header>

      <form onSubmit={add} className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="flex-1 min-w-0">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">New tag name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Groceries, Dining, etc." className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" required />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Color</span>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full ring-offset-2 ${color === c ? "ring-2 ring-foreground" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </div>
          <button className="w-full sm:w-auto rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-warm)" }}>
            <Plus className="inline h-4 w-4 mr-1" /> Add tag
          </button>
        </div>
      </form>

      <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-[var(--shadow-soft)]">
        <h2 className="mb-4 font-display text-base sm:text-lg font-semibold">Existing categories</h2>
        <div className="flex flex-wrap gap-2 sm:gap-2.5">
          {tags.map((t) => (
            <div key={t.id} className="group flex items-center gap-2 rounded-full border px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-all" style={{ background: t.color + "18", borderColor: t.color + "44", color: t.color }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
              <span>{t.name}</span>
              {t.is_default && <span className="text-[10px] uppercase tracking-wider opacity-60">default</span>}
              <div className="ml-1 flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditingTag(t)} title="Edit tag" className="p-0.5 hover:text-foreground">
                  <Pencil className="h-3 w-3" />
                </button>
                {isAdmin && !t.is_default && (
                  <button onClick={() => del(t.id)} title="Delete tag" className="p-0.5 hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {editingTag && (
          <EditTagDialog
            tag={editingTag}
            onClose={() => setEditingTag(null)}
            onSaved={() => { load(); setEditingTag(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EditTagDialog({ tag, onClose, onSaved }: { tag: Tag; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("tags").update({
      name: name.trim(),
      color,
    }).eq("id", tag.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Tag updated");
    onSaved();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Edit tag</h2>
          <button type="button" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Tag name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" required autoFocus />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Color</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`h-8 w-8 rounded-full ring-offset-2 ${color === c ? "ring-2 ring-foreground" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <button disabled={saving} className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-warm)" }}>
          {saving ? "Saving…" : "Update tag"}
        </button>
      </motion.form>
    </motion.div>
  );
}
