import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mic, Square, Type, MicOff, ShieldAlert, ExternalLink, CloudOff } from "lucide-react";
import { toast } from "sonner";
import { saveAudio, enqueue } from "@/lib/offline-store";
import { useOnline } from "@/hooks/use-online";

function getPlatform(): { os: "ios" | "android" | "other"; browser: "safari" | "chrome" | "other" } {
  if (typeof navigator === "undefined") return { os: "other", browser: "other" };
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome|chromium|crios/.test(ua);
  const isChrome = /chrome|chromium|crios/.test(ua);
  return {
    os: isIOS ? "ios" : isAndroid ? "android" : "other",
    browser: isSafari ? "safari" : isChrome ? "chrome" : "other",
  };
}

function PermissionDeniedBanner({ onRetry }: { onRetry: () => void }) {
  const { os, browser } = getPlatform();
  let steps: string[] = [];
  let helpLabel = "";
  let helpUrl = "";

  if (os === "ios" || browser === "safari") {
    steps = [
      "Ouvrez l'app Réglages sur votre iPhone/iPad.",
      "Descendez et touchez Safari.",
      "Touchez Micro (ou Appareil photo & micro).",
      "Sélectionnez Autoriser pour ce site.",
      "Revenez dans Safari et rechargez cette page.",
    ];
    helpLabel = "Aide Apple — gérer les permissions";
    helpUrl = "https://support.apple.com/fr-fr/guide/iphone/iph145586c2e/ios";
  } else if (os === "android" || browser === "chrome") {
    steps = [
      "Dans Chrome, touchez l'icône cadenas (ou ⋮) dans la barre d'adresse.",
      "Touchez Autorisations (ou Paramètres du site).",
      "Touchez Microphone.",
      "Choisissez Autoriser.",
      "Rechargez cette page.",
    ];
    helpLabel = "Aide Google Chrome — permissions de site";
    helpUrl = "https://support.google.com/chrome/answer/2693767?hl=fr";
  } else {
    steps = [
      "Ouvrez les réglages de votre navigateur.",
      "Recherchez la section Permissions / Confidentialité.",
      "Autorisez le microphone pour ce site.",
      "Rechargez cette page.",
    ];
    helpLabel = "Aide générale — permissions navigateur";
    helpUrl = "https://support.google.com/chrome/answer/2693767?hl=fr";
  }

  return (
    <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <MicOff className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div className="flex-1">
        <p className="font-medium">Accès au micro refusé</p>
        <p className="mt-1 text-muted-foreground">Pour enregistrer, autorisez le micro&nbsp;:</p>
        <ol className="mt-2 list-decimal pl-5 text-muted-foreground space-y-0.5">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        <a href={helpUrl} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-gold hover:underline">
          <ExternalLink className="h-3.5 w-3.5" />
          {helpLabel}
        </a>
        <div className="mt-3">
          <button onClick={onRetry} className="rounded-lg btn-gold px-4 py-2 text-xs">Réessayer</button>
        </div>
      </div>
    </div>
  );
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    try { if ((MediaRecorder as any).isTypeSupported?.(m)) return m; } catch {}
  }
  return "";
}

export const Route = createFileRoute("/record/$type")({
  component: RecordPage,
  head: () => ({ meta: [{ title: "Enregistrement — AURUM" }] }),
});

function RecordPage() {
  const { type } = useParams({ from: "/record/$type" });
  const docType = (type === "pv" ? "pv" : "rapport") as "rapport" | "pv";
  const navigate = useNavigate();
  const online = useOnline();

  const [supported, setSupported] = useState(true);
  const [secureOk, setSecureOk] = useState(true);
  const [permission, setPermission] = useState<"unknown" | "prompt" | "granted" | "denied">("unknown");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState("");
  const [saving, setSaving] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const secure = window.isSecureContext || location.hostname === "localhost";
    setSecureOk(secure);
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasRec = typeof MediaRecorder !== "undefined";
    if (!hasMedia || !hasRec) setSupported(false);
    const perms = (navigator as any).permissions;
    if (perms?.query) {
      perms.query({ name: "microphone" as PermissionName })
        .then((status: any) => {
          setPermission(status.state);
          status.onchange = () => setPermission(status.state);
        })
        .catch(() => {});
    }
    return () => {
      try { recRef.current?.stop(); } catch {}
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function ensureMicAccess(): Promise<MediaStream | null> {
    if (!secureOk) { toast.error("Le micro nécessite HTTPS."); return null; }
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("Micro indisponible."); return null; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermission("granted");
      return stream;
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPermission("denied");
        toast.error("Accès micro refusé.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        toast.error("Aucun micro détecté.");
      } else {
        toast.error("Micro indisponible : " + (err?.message || name));
      }
      return null;
    }
  }

  async function start() {
    if (!supported) return;
    const stream = await ensureMicAccess();
    if (!stream) return;
    const mime = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e: any) {
      stream.getTracks().forEach(t => t.stop());
      toast.error("Impossible de démarrer : " + e.message);
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onerror = (e: any) => { toast.error("Erreur enregistrement : " + (e?.error?.message || "inconnue")); };
    rec.start(1000);
    recRef.current = rec;
    streamRef.current = stream;
    startedAtRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  }

  async function stopAndSave() {
    const rec = recRef.current;
    const stream = streamRef.current;
    if (!rec) return;
    setSaving(true);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const finalBlob: Blob = await new Promise((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        resolve(new Blob(chunksRef.current, { type }));
      };
      try { rec.stop(); } catch { resolve(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })); }
    });
    stream?.getTracks().forEach(t => t.stop());
    recRef.current = null;
    streamRef.current = null;
    setRecording(false);

    try {
      const durationMs = Date.now() - startedAtRef.current;
      const mimeType = finalBlob.type || "audio/webm";
      if (finalBlob.size === 0) throw new Error("Enregistrement vide");
      const audioId = await saveAudio(finalBlob, mimeType, durationMs);
      await enqueue({ type: docType, audioId });
      toast.success(online ? "Enregistré — synchronisation en cours" : "Enregistré localement — sync à la reconnexion");
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur sauvegarde locale");
      setSaving(false);
    }
  }

  async function submitManual() {
    const t = manualText.trim();
    if (!t) { toast.error("Saisissez du texte."); return; }
    setSaving(true);
    try {
      await enqueue({ type: docType, transcript: t });
      toast.success(online ? "Ajouté — synchronisation en cours" : "Ajouté à la file — sync à la reconnexion");
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
      setSaving(false);
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

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
            ? "Saisissez ou collez votre texte. La génération démarrera dès que possible."
            : "Parlez clairement. L'audio est sauvegardé localement, la transcription IA se lance dès la reconnexion."}
        </p>
      </header>

      {!online && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-medium text-amber-300">Mode hors ligne activé</p>
            <p className="mt-1 text-muted-foreground">Vos enregistrements sont stockés sur l'appareil et seront synchronisés automatiquement dès le retour de la connexion.</p>
          </div>
        </div>
      )}

      {!supported && !manual && (
        <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Votre navigateur ne supporte pas l'enregistrement audio. Utilisez la saisie manuelle ci-dessous.
        </div>
      )}

      {!secureOk && !manual && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Connexion non sécurisée</p>
            <p className="mt-1 text-muted-foreground">Le micro nécessite HTTPS.</p>
          </div>
        </div>
      )}

      {permission === "denied" && !manual && (
        <PermissionDeniedBanner onRetry={() => { setPermission("unknown"); void start(); }} />
      )}

      {!manual ? (
        <>
          <div className="mt-8 flex flex-col items-center">
            <button
              onClick={recording ? stopAndSave : start}
              disabled={!supported || saving}
              className={`flex h-32 w-32 items-center justify-center rounded-full transition ${
                recording ? "bg-destructive pulse-rec" : "btn-gold"
              } disabled:opacity-40`}
            >
              {recording ? <Square className="h-12 w-12 fill-current" /> : <Mic className="h-14 w-14" />}
            </button>
            <div className="mt-6 font-display text-4xl tabular-nums">{mm}:{ss}</div>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              {recording ? "Enregistrement en cours" : saving ? "Sauvegarde…" : elapsed > 0 ? "Terminé" : "Appuyez pour démarrer"}
            </p>
          </div>

          <div className="glass-card mt-8 rounded-xl p-4 text-sm leading-relaxed text-muted-foreground">
            {recording
              ? "Audio capturé localement. Appuyez sur ◼ pour arrêter et enregistrer."
              : "L'audio sera stocké sur l'appareil puis transcrit automatiquement par l'IA."}
          </div>
        </>
      ) : (
        <>
          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder="Collez ou saisissez la prise de parole…"
            className="mt-8 min-h-64 w-full rounded-xl border border-border bg-input/50 p-4 text-sm leading-relaxed outline-none focus:border-gold"
          />
          <button
            onClick={submitManual}
            disabled={saving || !manualText.trim()}
            className="mt-4 w-full rounded-xl btn-gold px-6 py-4 text-base disabled:opacity-40"
          >
            Ajouter à la file
          </button>
        </>
      )}

      <div className="mt-6">
        <button
          onClick={() => { setManual(m => !m); if (recording) void stopAndSave(); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card/50 px-6 py-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <Type className="h-4 w-4" /> {manual ? "Revenir au micro" : "Saisir manuellement"}
        </button>
      </div>
    </div>
  );
}
