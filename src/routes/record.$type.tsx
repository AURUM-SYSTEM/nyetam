import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mic, Square, Loader2, Type, MicOff, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateDocument } from "@/lib/aurum.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/record/$type")({
  component: RecordPage,
  head: () => ({ meta: [{ title: "Enregistrement — AURUM" }] }),
});

type SR = any;

function getSR(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function RecordPage() {
  const { type } = useParams({ from: "/record/$type" });
  const docType = (type === "pv" ? "pv" : "rapport") as "rapport" | "pv";
  const navigate = useNavigate();
  const generate = useServerFn(generateDocument);

  const [supported, setSupported] = useState(true);
  const [secureOk, setSecureOk] = useState(true);
  const [permission, setPermission] = useState<"unknown" | "prompt" | "granted" | "denied">("unknown");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [partial, setPartial] = useState("");
  const [processing, setProcessing] = useState(false);
  const [manual, setManual] = useState(false);

  const recRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    const SR = getSR();
    if (!SR) setSupported(false);
    if (typeof window !== "undefined") {
      const secure = window.isSecureContext || location.hostname === "localhost";
      setSecureOk(secure);
      const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      if (!hasMedia) setSupported(false);
      const perms = (navigator as any).permissions;
      if (perms?.query) {
        perms.query({ name: "microphone" as PermissionName })
          .then((status: any) => {
            setPermission(status.state);
            status.onchange = () => setPermission(status.state);
          })
          .catch(() => {});
      }
    }
    return () => {
      try { recRef.current?.stop(); } catch {}
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function ensureMicAccess(): Promise<boolean> {
    if (!secureOk) {
      toast.error("Le micro nécessite HTTPS. Ouvrez l'app via une URL sécurisée.");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Votre navigateur ne donne pas accès au micro.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setPermission("granted");
      return true;
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPermission("denied");
        toast.error("Accès micro refusé. Activez-le dans les réglages du navigateur.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        toast.error("Aucun micro détecté sur cet appareil.");
      } else {
        toast.error("Micro indisponible : " + (err?.message || name));
      }
      return false;
    }
  }

  async function start() {
    const SR = getSR();
    if (!SR) { setSupported(false); return; }
    const ok = await ensureMicAccess();
    if (!ok) return;
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setTranscript(finalRef.current);
      setPartial(interim);
    };
    rec.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setPermission("denied");
        setRecording(false);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        toast.error("Accès micro refusé. Autorisez le micro dans les réglages du navigateur.");
        return;
      }
      toast.error("Erreur micro: " + e.error);
    };
    rec.onend = () => {
      if (recRef.current === rec && recording) {
        try { rec.start(); } catch {}
      }
    };
    recRef.current = rec;
    finalRef.current = transcript;
    try {
      rec.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch (err: any) {
      toast.error("Impossible de démarrer: " + err.message);
    }
  }

  function stop() {
    setRecording(false);
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPartial("");
  }

  async function proceed() {
    const finalText = (transcript + " " + partial).trim();
    if (!finalText) { toast.error("Aucun texte à traiter."); return; }
    setProcessing(true);
    try {
      const result = await generate({ data: { transcript: finalText, type: docType } });
      const { data, error } = await supabase
        .from("documents")
        .insert({
          type: docType,
          title: result.title,
          transcript: finalText,
          introduction: result.introduction,
          faits: result.faits,
          declarations: result.declarations,
          conclusion: result.conclusion,
          status: "ready",
        })
        .select("id")
        .single();
      if (error) throw error;
      navigate({ to: "/document/$id", params: { id: data.id } });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur génération");
      setProcessing(false);
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (processing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-gold/20" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-soft">
            <Loader2 className="h-10 w-10 animate-spin text-background" />
          </div>
        </div>
        <h2 className="mt-8 font-display text-2xl">Génération du document…</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          L'IA structure votre prise de parole. Cela prend quelques secondes.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 pb-32">
      <Link to="/new" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <header className="mt-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Étape 2 / 3 — {docType === "rapport" ? "Rapport" : "PV"}</p>
        <h1 className="mt-2 font-display text-3xl">Enregistrement</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {manual
            ? "Saisissez ou collez votre texte."
            : "Parlez clairement. La transcription se fait en temps réel."}
        </p>
      </header>

      {!supported && !manual && (
        <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Votre navigateur ne supporte pas la reconnaissance vocale. Utilisez la saisie manuelle ci-dessous, ou ouvrez l'application dans Chrome/Safari.
        </div>
      )}

      {!secureOk && !manual && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Connexion non sécurisée</p>
            <p className="mt-1 text-muted-foreground">Le micro nécessite HTTPS. Ouvrez l'application via une URL sécurisée (https://) pour activer l'enregistrement.</p>
          </div>
        </div>
      )}

      {permission === "denied" && !manual && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <MicOff className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Accès au micro refusé</p>
            <p className="mt-1 text-muted-foreground">
              Pour enregistrer, autorisez le micro&nbsp;:
            </p>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-0.5">
              <li><span className="text-foreground">iPhone (Safari)</span> : Réglages → Safari → Micro → Autoriser.</li>
              <li><span className="text-foreground">Android (Chrome)</span> : icône cadenas dans la barre d'adresse → Autorisations → Micro.</li>
              <li>Puis rechargez la page.</li>
            </ul>
            <button
              onClick={() => { setPermission("unknown"); start(); }}
              className="mt-3 rounded-lg btn-gold px-4 py-2 text-xs"
            >
              Réessayer
            </button>
          </div>
        </div>
      )}

      {!manual ? (
        <>
          <div className="mt-8 flex flex-col items-center">
            <button
              onClick={recording ? stop : start}
              disabled={!supported}
              className={`flex h-32 w-32 items-center justify-center rounded-full transition ${
                recording
                  ? "bg-destructive pulse-rec"
                  : "btn-gold"
              } disabled:opacity-40`}
            >
              {recording ? <Square className="h-12 w-12 fill-current" /> : <Mic className="h-14 w-14" />}
            </button>
            <div className="mt-6 font-display text-4xl tabular-nums">
              {mm}:{ss}
            </div>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              {recording ? "Enregistrement en cours" : elapsed > 0 ? "En pause" : "Appuyez pour démarrer"}
            </p>
          </div>

          <div className="glass-card mt-8 max-h-64 overflow-y-auto rounded-xl p-4 text-sm leading-relaxed">
            {transcript || partial ? (
              <>
                <span>{transcript}</span>
                <span className="text-muted-foreground italic">{partial}</span>
              </>
            ) : (
              <span className="text-muted-foreground">La transcription apparaîtra ici…</span>
            )}
          </div>
        </>
      ) : (
        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder="Collez ou saisissez la prise de parole…"
          className="mt-8 min-h-64 w-full rounded-xl border border-border bg-input/50 p-4 text-sm leading-relaxed outline-none focus:border-gold"
        />
      )}

      <div className="mt-6 space-y-2">
        <button
          onClick={proceed}
          disabled={!(transcript + partial).trim() || recording}
          className="w-full rounded-xl btn-gold px-6 py-4 text-base disabled:opacity-40"
        >
          Générer le document
        </button>
        <button
          onClick={() => { setManual(m => !m); if (recording) stop(); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card/50 px-6 py-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <Type className="h-4 w-4" /> {manual ? "Revenir au micro" : "Saisir manuellement"}
        </button>
      </div>
    </div>
  );
}
