import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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

export const generateDocument = createServerFn({ method: "POST" })
  .inputValidator((d: { transcript: string; type: "rapport" | "pv" }) =>
    z.object({ transcript: z.string().min(1).max(50000), type: z.enum(["rapport", "pv"]) }).parse(d),
  )
  .handler(async ({ data }) => {
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
${data.transcript}
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
