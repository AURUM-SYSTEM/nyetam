import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Sparkles, Save, Trash2, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { improveText } from "@/lib/aurum.functions";
import { useServerFn } from "@tanstack/react-start";
import { exportDocumentPdf } from "@/lib/pdf";

export const Route = createFileRoute("/document/$id")({
  component: DocPage,
  head: () => ({ meta: [{ title: "Document — AURUM" }] }),
});

type Doc = {
  id: string;
  type: "rapport" | "pv";
  title: string;
  transcript: string;
  introduction: string;
  faits: string;
  declarations: string;
  conclusion: string;
  created_at: string;
};

const SECTIONS: Array<{ key: keyof Doc; label: string }> = [
  { key: "introduction", label: "Introduction" },
  { key: "faits", label: "Faits" },
  { key: "declarations", label: "Déclarations" },
  { key: "conclusion", label: "Conclusion" },
];

function DocPage() {
  const { id } = useParams({ from: "/document/$id" });
  const navigate = useNavigate();
  const improve = useServerFn(improveText);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("id", id).single();
      if (error) { toast.error(error.message); return; }
      setDoc(data as Doc);
    })();
  }, [id]);

  function patch<K extends keyof Doc>(k: K, v: Doc[K]) {
    setDoc(d => d ? { ...d, [k]: v } : d);
    setDirty(true);
  }

  async function save() {
    if (!doc) return;
    setSaving(true);
    const { error } = await supabase
      .from("documents")
      .update({
        title: doc.title,
        introduction: doc.introduction,
        faits: doc.faits,
        declarations: doc.declarations,
        conclusion: doc.conclusion,
      })
      .eq("id", doc.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { setDirty(false); toast.success("Enregistré"); }
  }

  async function improveSection(key: keyof Doc, label: string) {
    if (!doc) return;
    const current = String(doc[key] ?? "");
    if (!current.trim()) { toast.error("Section vide"); return; }
    setImproving(String(key));
    try {
      const { text } = await improve({ data: { text: current, section: label } });
      patch(key, text as Doc[typeof key]);
      toast.success("Texte amélioré");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally {
      setImproving(null);
    }
  }

  async function remove() {
    if (!doc) return;
    if (!confirm("Supprimer ce document ?")) return;
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) toast.error(error.message);
    else navigate({ to: "/" });
  }

  function download() {
    if (!doc) return;
    exportDocumentPdf(doc);
    toast.success("PDF généré");
  }

  async function share() {
    if (!doc) return;
    const text = SECTIONS.map(s => `${s.label.toUpperCase()}\n${doc[s.key]}`).join("\n\n");
    const full = `${doc.title}\n\n${text}`;
    const navAny = navigator as any;
    if (navAny.share) {
      try { await navAny.share({ title: doc.title, text: full }); } catch {}
    } else {
      await navigator.clipboard.writeText(full);
      toast.success("Copié dans le presse-papiers");
    }
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 pb-40">
      <div className="flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Accueil
        </Link>
        <button onClick={remove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <header className="mt-6">
        <span className="rounded bg-accent px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold-soft">
          {doc.type === "rapport" ? "Rapport" : "Procès-verbal"}
        </span>
        <input
          value={doc.title}
          onChange={e => patch("title", e.target.value)}
          className="mt-3 w-full bg-transparent font-display text-3xl leading-tight outline-none focus:text-gold"
        />
        <div className="mt-1 text-xs text-muted-foreground">
          {new Date(doc.created_at).toLocaleString("fr-FR")}
        </div>
      </header>

      <div className="mt-8 space-y-5">
        {SECTIONS.map(s => (
          <section key={String(s.key)} className="glass-card rounded-xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-base uppercase tracking-wider text-gold">{s.label}</h2>
              <button
                onClick={() => improveSection(s.key, s.label)}
                disabled={improving === String(s.key)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] text-gold-soft transition hover:bg-gold/20 disabled:opacity-50"
              >
                {improving === String(s.key)
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Sparkles className="h-3 w-3" />}
                Améliorer
              </button>
            </div>
            <textarea
              value={String(doc[s.key] ?? "")}
              onChange={e => patch(s.key, e.target.value as any)}
              rows={Math.max(4, Math.ceil(String(doc[s.key] ?? "").length / 60))}
              className="w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
              placeholder={`Contenu de la section ${s.label.toLowerCase()}…`}
            />
          </section>
        ))}
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-5 py-3">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-3 text-sm disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {dirty ? "Enregistrer" : "À jour"}
          </button>
          <button
            onClick={share}
            className="rounded-lg border border-border bg-card px-3 py-3 text-sm"
            aria-label="Partager"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={download}
            className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-lg btn-gold px-3 py-3 text-sm"
          >
            <Download className="h-4 w-4" /> Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}
