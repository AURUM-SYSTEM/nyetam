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

const LangSchema = z.enum(["fr", "en"]).default("fr");

export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((d: { audioBase64: string; mimeType: string; lang?: "fr" | "en" }) =>
    z.object({
      audioBase64: z.string().min(1).max(40_000_000),
      mimeType: z.string().min(1).max(100),
      lang: LangSchema.optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const format = audioFormatFromMime(data.mimeType);
    const lang = data.lang ?? "fr";
    const sys = lang === "en"
      ? "You are a professional audio transcriber. Faithfully transcribe the audio content in English, with no commentary, no preamble, no markdown. If audio is inaudible or empty, return an empty string."
      : "Tu es un transcripteur audio professionnel français. Transcris fidèlement le contenu audio en français, sans ajouter de commentaire, sans préambule, sans markdown. Si l'audio est inaudible ou vide, renvoie une chaîne vide.";
    const userText = lang === "en" ? "Transcribe this audio recording in English." : "Transcris cet enregistrement audio en français.";
    const content = await callGatewayRaw([
      { role: "system", content: sys },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
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
  observations: string;
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

async function cleanRawTranscript(raw: string, lang: "fr" | "en" = "fr"): Promise<string> {
  const sys = lang === "en"
    ? "You clean raw audio transcriptions in English. STRICT rules: remove repetitions and hesitations (uh, um, well, like, etc.), fix broken or unfinished sentences, reformulate cleanly in a professional and formal style, BUT strictly keep the original meaning — invent NO information, do not summarize, do not shorten factual content. Return ONLY the cleaned text, no preamble, no quotes, no markdown."
    : "Tu nettoies des transcriptions audio brutes en français. Règles STRICTES : supprime les répétitions et hésitations (euh, ben, du coup, voilà, etc.), corrige les phrases cassées ou inachevées, reformule proprement dans un style professionnel et formel, mais GARDE rigoureusement le sens original — n'invente AUCUNE information, ne résume pas, ne raccourcis pas le contenu factuel. Renvoie UNIQUEMENT le texte nettoyé, sans préambule, sans guillemets, sans markdown.";
  const cleaned = await callGateway([
    { role: "system", content: sys },
    { role: "user", content: raw },
  ]);
  const out = cleaned.trim();
  return out.length > 0 ? out : raw;
}

export const cleanTranscript = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; lang?: "fr" | "en" }) =>
    z.object({ text: z.string().min(1).max(50000), lang: LangSchema.optional() }).parse(d),
  )
  .handler(async ({ data }) => ({ text: await cleanRawTranscript(data.text, data.lang ?? "fr") }));

export const generateDocument = createServerFn({ method: "POST" })
  .inputValidator((d: { transcript: string; type: "rapport" | "pv"; lang?: "fr" | "en" }) =>
    z.object({
      transcript: z.string().min(1).max(50000),
      type: z.enum(["rapport", "pv"]),
      lang: LangSchema.optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const lang = data.lang ?? "fr";
    const cleanedTranscript = await cleanRawTranscript(data.transcript, lang);
    const typeLabel = lang === "en"
      ? (data.type === "rapport" ? "REPORT" : "MINUTES")
      : (data.type === "rapport" ? "RAPPORT" : "PROCÈS-VERBAL");

    const system = lang === "en"
      ? `You are a legal and administrative assistant specialized in producing official ${typeLabel} from field audio transcripts. Write in formal, precise, factual English. Style: administrative, professional, synthetic, clear, NON-narrative. Prefer concise sentences and bullet-style enumerations where helpful. Strictly structure the output. Respond STRICTLY in valid JSON.`
      : `Tu es un assistant juridique et administratif spécialisé dans la rédaction de ${typeLabel}s officiels à partir de retranscriptions audio terrain. Tu rédiges en français formel, précis, factuel. Style : administratif, professionnel, synthétique, clair, NON-narratif. Privilégie les phrases concises et les énumérations à puces quand pertinent. Tu structures rigoureusement le contenu. Réponds STRICTEMENT en JSON valide.`;

    const user = lang === "en"
      ? `Here is the raw transcription of a field recording. Produce a structured ${typeLabel}.

Return EXCLUSIVELY a JSON object with these keys:
{
  "title": "Short descriptive title (max 80 chars)",
  "introduction": "CONTEXT: presumed date, location, parties involved, scope of the mission",
  "faits": "FACTS OBSERVED: chronological and objective enumeration of facts",
  "declarations": "STATEMENTS COLLECTED: declarations made by the persons mentioned (paraphrased if needed)",
  "observations": "OBSERVATIONS: technical or operational remarks, anomalies, points requiring attention",
  "conclusion": "CONCLUSION: synthesis, findings and recommended follow-up"
}

Each section must be administrative in tone, NOT narrative. No markdown, no **bold**, plain text only. If information is missing, indicate it soberly.

TRANSCRIPTION:
"""
${cleanedTranscript}
"""`
      : `Voici la retranscription brute d'un enregistrement terrain. Génère un ${typeLabel} structuré.

Retourne EXCLUSIVEMENT un objet JSON avec ces clés :
{
  "title": "Titre court et descriptif (max 80 caractères)",
  "introduction": "CONTEXTE : date présumée, lieu, parties prenantes, objet de la mission",
  "faits": "FAITS CONSTATÉS : énumération chronologique et objective des faits",
  "declarations": "DÉCLARATIONS RECUEILLIES : déclarations des personnes mentionnées (paraphrasées si nécessaire)",
  "observations": "OBSERVATIONS : remarques techniques ou opérationnelles, anomalies, points d'attention",
  "conclusion": "CONCLUSION : synthèse, constatations et suites recommandées"
}

Chaque section doit avoir un ton administratif, NON narratif. Pas de markdown, pas de **gras**, juste du texte brut. Si une information manque, indique-le sobrement.

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
      observations: String(parsed.observations ?? ""),
      conclusion: String(parsed.conclusion ?? ""),
      cleanedTranscript,
    };
  });

export const improveText = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; section: string; lang?: "fr" | "en" }) =>
    z.object({
      text: z.string().min(1).max(10000),
      section: z.string().min(1).max(50),
      lang: LangSchema.optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const lang = data.lang ?? "fr";
    const sys = lang === "en"
      ? "You improve administrative/legal English texts. Fix grammar, smooth the style, keep meaning and formal tone. Return ONLY the improved text, no preamble."
      : "Tu améliores des textes administratifs/juridiques en français. Tu corriges la grammaire, fluidifies le style, gardes le sens et le ton formel. Renvoie UNIQUEMENT le texte amélioré, sans préambule.";
    const content = await callGateway([
      { role: "system", content: sys },
      { role: "user", content: lang === "en" ? `Improve this "${data.section}" section:\n\n${data.text}` : `Améliore cette section « ${data.section} » :\n\n${data.text}` },
    ]);
    return { text: content.trim() };
  });
