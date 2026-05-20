import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Plus, Mic, Trash2, ChevronRight, CloudOff } from "lucide-react";
import { toast } from "sonner";
import { PendingQueue } from "@/components/PendingQueue";
import { useOnline } from "@/hooks/use-online";

type DocRow = {
  id: string;
  type: "rapport" | "pv";
  title: string;
  status: string;
  created_at: string;
};

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "AURUM SYSTEM — Accueil" },
      { name: "description", content: "Vos rapports et procès-verbaux générés par IA, en un coup d'œil." },
    ],
  }),
});

function HomePage() {
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const navigate = useNavigate();
  const online = useOnline();

  async function load() {
    const { data, error } = await supabase
      .from("documents")
      .select("id,type,title,status,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) { toast.error(error.message); return; }
    setDocs(data as DocRow[]);
  }

  useEffect(() => { void load(); }, []);

  async function remove(id: string) {
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Document supprimé"); void load(); }
  }

  return (
    <div className="px-5 pt-10 pb-32">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Aurum System</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">
          De la <span className="gold-text">voix</span><br />au document.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Enregistrez, structurez et exportez vos rapports terrain en quelques secondes.
        </p>
      </header>

      {!online && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-medium text-amber-300">Mode hors ligne activé</p>
            <p className="mt-1 text-muted-foreground">Vos données seront synchronisées automatiquement dès le retour de la connexion.</p>
          </div>
        </div>
      )}



      <button
        onClick={() => navigate({ to: "/new" })}
        className="group relative w-full overflow-hidden rounded-2xl btn-gold px-6 py-5 text-left"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest opacity-70">
              <Plus className="h-3.5 w-3.5" /> Nouveau
            </div>
            <div className="mt-1 font-display text-2xl">Créer un document</div>
          </div>
          <Mic className="h-10 w-10 opacity-80" />
        </div>
      </button>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg">Documents récents</h2>
          {docs && <span className="text-xs text-muted-foreground">{docs.length}</span>}
        </div>

        {docs === null && (
          <div className="space-y-2">
            {[0,1,2].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />)}
          </div>
        )}

        {docs && docs.length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Aucun document pour l'instant.</p>
            <p className="text-xs text-muted-foreground">Créez votre premier rapport.</p>
          </div>
        )}

        <ul className="space-y-2">
          {docs?.map(d => (
            <li key={d.id} className="glass-card group flex items-center rounded-xl">
              <Link
                to="/document/$id"
                params={{ id: d.id }}
                className="flex flex-1 items-center gap-3 px-4 py-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                  <FileText className="h-5 w-5 text-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold-soft">
                      {d.type === "rapport" ? "Rapport" : "PV"}
                    </span>
                    {d.status === "draft" && (
                      <span className="text-[10px] uppercase text-muted-foreground">Brouillon</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium">{d.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(d.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <button
                onClick={() => remove(d.id)}
                className="px-3 py-3 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                aria-label="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
