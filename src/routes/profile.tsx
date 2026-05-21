import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { getProfile, saveProfile, type AurumProfile } from "@/lib/profile-store";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profil — AURUM" }] }),
});

function ProfilePage() {
  const { t } = useI18n();
  const [p, setP] = useState<AurumProfile>({ name: "", role: "", defaultLocation: "", signature: "" });

  useEffect(() => { setP(getProfile()); }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    saveProfile(p);
    toast.success(t("doc.saved_ok"));
  }

  return (
    <div className="px-5 pt-8 pb-32">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Link>
      <header className="mt-6">
        <h1 className="font-display text-3xl">{t("profile.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("profile.sub")}</p>
      </header>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label={t("profile.name")} value={p.name} onChange={v => setP({ ...p, name: v })} />
        <Field label={t("profile.role")} value={p.role} onChange={v => setP({ ...p, role: v })} />
        <Field label={t("profile.default_location")} value={p.defaultLocation} onChange={v => setP({ ...p, defaultLocation: v })} />
        <Field label={t("profile.signature")} value={p.signature} onChange={v => setP({ ...p, signature: v })} />

        <button type="submit" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl btn-gold px-6 py-4">
          <Save className="h-4 w-4" /> {t("profile.save")}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-input/50 px-4 py-3 text-sm outline-none focus:border-gold"
      />
    </label>
  );
}
