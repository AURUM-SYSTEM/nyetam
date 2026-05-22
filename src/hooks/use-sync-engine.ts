import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  listPending,
  updateQueueItem,
  getAudio,
  deleteAudio,
  blobToBase64,
  subscribeQueue,
  type QueueItem,
} from "@/lib/offline-store";
import { transcribeAudio, generateDocument } from "@/lib/aurum.functions";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getCachedProfile } from "@/hooks/use-auth";

export function useSyncEngine() {
  const transcribe = useServerFn(transcribeAudio);
  const generate = useServerFn(generateDocument);
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function processOne(item: QueueItem) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error("Non authentifié");
        const userId = item.userId ?? session.user.id;

        const profile = getCachedProfile();
        const lang = item.meta?.lang ?? profile?.preferred_lang ?? "fr";
        const country = item.meta?.country ?? profile?.country ?? "";
        const profession = item.meta?.profession ?? profile?.profession ?? "";

        let transcript = item.transcript ?? "";

        if (item.audioId && !transcript) {
          await updateQueueItem(item.id, { status: "transcribing" });
          const audio = await getAudio(item.audioId);
          if (!audio) throw new Error("Audio local introuvable");
          const audioBase64 = await blobToBase64(audio.blob);
          const t = await transcribe({
            data: { audioBase64, mimeType: audio.mimeType, lang },
          });
          transcript = t.text;
          if (!transcript.trim()) throw new Error("Transcription vide");
          await updateQueueItem(item.id, { transcript });
        }

        if (!transcript.trim()) throw new Error("Aucun texte à traiter");

        await updateQueueItem(item.id, { status: "generating" });
        const result = await generate({
          data: { transcript, type: item.type, lang, country, profession },
        });

        const { data, error } = await supabase
          .from("documents")
          .insert({
            user_id: userId,
            type: item.type,
            title: result.title,
            transcript: result.cleanedTranscript ?? transcript,
            introduction: result.introduction,
            faits: result.faits,
            declarations: result.declarations,
            observations: result.observations ?? "",
            conclusion: result.conclusion,
            status: "ready",
            agent_name: item.meta?.agentName ?? "",
            location: item.meta?.location ?? "",
            reference: item.meta?.reference ?? "",
            signature_name: item.meta?.signatureName ?? item.meta?.agentName ?? "",
            doc_date: item.meta?.docDate ?? null,
            doc_time: item.meta?.docTime ?? null,
            lang,
          })
          .select("id")
          .single();
        if (error) throw error;

        await updateQueueItem(item.id, {
          status: "synced",
          remoteDocId: data.id,
          title: result.title,
          errorMsg: undefined,
        });
        if (item.audioId) {
          try { await deleteAudio(item.audioId); } catch {}
        }
        toast.success(`Synchronisé : ${result.title}`);
      } catch (e: any) {
        console.error("[sync]", e);
        await updateQueueItem(item.id, {
          status: "error",
          errorMsg: e?.message ?? "Erreur inconnue",
        });
      }
    }

    async function runPass() {
      if (running.current) return;
      if (!navigator.onLine) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      running.current = true;
      try {
        const pending = await listPending();
        const toProcess = pending.filter(
          i => i.status === "pending" || i.status === "uploading" || i.status === "transcribing" || i.status === "generating",
        );
        for (const item of toProcess) {
          if (cancelled || !navigator.onLine) break;
          await processOne(item);
        }
      } finally {
        running.current = false;
      }
    }

    const onOnline = () => { void runPass(); };
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => { void runPass(); }, 30000);
    const unsub = subscribeQueue(() => { void runPass(); });
    void runPass();

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
      unsub();
    };
  }, [transcribe, generate]);
}
