import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

type GatewayMessage =
  | { role: string; content: string }
  | { role: string; content: Array<
      | { type: "text"; text: string }
      | { type: "input_audio"; input_audio: { data: string; format: string } }
    > };

async function callGatewayRaw(messages: GatewayMessage[], jsonMode = false) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Limite de requêtes atteinte, réessayez dans un instant.");
    if (res.status === 402) throw new Error("Crédits IA épuisés. Ajoutez des crédits dans Lovable.");
    throw new Error(`Erreur IA (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

function audioFormatFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}

export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((d: { audioBase64: string; mimeType: string }) =>
    z.object({
      audioBase64: z.string().min(1).max(40_000_000),
      mimeType: z.string().min(1).max(100),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const format = audioFormatFromMime(data.mimeType);
    const content = await callGatewayRaw([
      {
        role: "system",
        content:
          "Tu es un transcripteur audio professionnel français. Transcris fidèlement le contenu audio en français, sans ajouter de commentaire, sans préambule, sans markdown. Si l'audio est inaudible ou vide, renvoie une chaîne vide.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcris cet enregistrement audio en français." },
          { type: "input_audio", input_audio: { data: data.audioBase64, format } },
        ],
      },
    ]);
    return { text: content.trim() };
  });

type StructuredDoc = {
  title: string;
  introduction: string;
  faits: string;
  declarations: string;
  conclusion: string;
};

async function callGateway(messages: Array<{ role: string; content: string }>, jsonMode = false) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Limite de requêtes atteinte, réessayez dans un instant.");
    if (res.status === 402) throw new Error("Crédits IA épuisés. Ajoutez des crédits dans Lovable.");
    throw new Error(`Erreur IA (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

async function cleanRawTranscript(raw: string): Promise<string> {
  const cleaned = await callGateway([
    {
      role: "system",
      content:
        "Tu nettoies des transcriptions audio brutes en français. Règles STRICTES : supprime les répétitions et hésitations (euh, ben, du coup, voilà, etc.), corrige les phrases cassées ou inachevées, reformule proprement dans un style professionnel et formel, mais GARDE rigoureusement le sens original — n'invente AUCUNE information, ne résume pas, ne raccourcis pas le contenu factuel. Renvoie UNIQUEMENT le texte nettoyé, sans préambule, sans guillemets, sans markdown.",
    },
    { role: "user", content: raw },
  ]);
  const out = cleaned.trim();
  return out.length > 0 ? out : raw;
}

export const cleanTranscript = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string }) =>
    z.object({ text: z.string().min(1).max(50000) }).parse(d),
  )
  .handler(async ({ data }) => ({ text: await cleanRawTranscript(data.text) }));

export const generateDocument = createServerFn({ method: "POST" })
  .inputValidator((d: { transcript: string; type: "rapport" | "pv" }) =>
    z.object({ transcript: z.string().min(1).max(50000), type: z.enum(["rapport", "pv"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const cleanedTranscript = await cleanRawTranscript(data.transcript);
    const typeLabel = data.type === "rapport" ? "RAPPORT" : "PROCÈS-VERBAL";
    const system = `Tu es un assistant juridique et administratif spécialisé dans la rédaction de ${typeLabel}s à partir de retranscriptions audio terrain. Tu rédiges en français formel, précis, factuel. Tu structures rigoureusement le contenu en quatre sections. Réponds STRICTEMENT en JSON valide.`;
    const user = `Voici la retranscription brute d'un enregistrement terrain. Génère un ${typeLabel} structuré.

Retourne EXCLUSIVEMENT un objet JSON avec ces clés :
{
  "title": "Titre court et descriptif (max 80 caractères)",
  "introduction": "Contexte, date présumée, lieu, parties prenantes mentionnées",
  "faits": "Description chronologique et objective des faits constatés",
  "declarations": "Citations et déclarations des personnes mentionnées (paraphrasées si nécessaire)",
  "conclusion": "Synthèse des constatations et suites éventuelles"
}

Chaque section doit faire au moins 2 phrases. Pas de markdown, pas de **gras**, juste du texte brut. Si une information manque, indique-le sobrement.

RETRANSCRIPTION :
"""
${cleanedTranscript}
"""`;

    const content = await callGateway(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      true,
    );

    let parsed: StructuredDoc;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Réponse IA non parseable");
      parsed = JSON.parse(m[0]);
    }
    return {
      title: String(parsed.title ?? "Document").slice(0, 200),
      introduction: String(parsed.introduction ?? ""),
      faits: String(parsed.faits ?? ""),
      declarations: String(parsed.declarations ?? ""),
      conclusion: String(parsed.conclusion ?? ""),
      cleanedTranscript,
    };
  });

export const improveText = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; section: string }) =>
    z.object({ text: z.string().min(1).max(10000), section: z.string().min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const content = await callGateway([
      {
        role: "system",
        content:
          "Tu améliores des textes administratifs/juridiques en français. Tu corriges la grammaire, fluidifies le style, gardes le sens et le ton formel. Renvoie UNIQUEMENT le texte amélioré, sans préambule.",
      },
      {
        role: "user",
        content: `Améliore cette section « ${data.section} » :\n\n${data.text}`,
      },
    ]);
    return { text: content.trim() };
  });
