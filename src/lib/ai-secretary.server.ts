// Server-only: AI first-contact secretary through Lovable AI Gateway (Responses API).
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const MODEL = "openai/gpt-6-astra";

export type Settings = {
  clinic_name: string;
  assistant_name: string;
  tone: string;
  procedures: string;
  questions: string;
};

const schema = z.object({
  reply: z.string(),
  handoff: z.boolean(),
  handoff_reason: z.string().nullable(),
  procedure: z.string().nullable(),
  experience: z.string().nullable(),
  goal: z.string().nullable(),
});
export type AiDecision = z.infer<typeof schema>;

export async function runSecretary(opts: {
  settings: Settings;
  history: { sender: "lead" | "ia" | "humano"; body: string }[];
  aiRepliesSoFar: number;
  maxAiReplies: number;
  contactName: string | null;
}): Promise<AiDecision> {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const { settings: s } = opts;
  const finalTurn = opts.aiRepliesSoFar >= opts.maxAiReplies;

  const instructions = `Você é ${s.assistant_name}, a secretária virtual da ${s.clinic_name}, uma clínica de estética, falando pelo WhatsApp em português do Brasil.
Seu ÚNICO papel é o primeiro contato: acolher o lead rápido para ele não esfriar, entender o interesse e passar para a especialista. Você NÃO vende, NÃO informa preços, NÃO agenda e NÃO dá orientação médica.

Tom de voz: ${s.tone}

Procedimentos da clínica (formato "Procedimento: pergunta específica"):
${s.procedures}

Perguntas gerais (antes da pergunta específica):
${s.questions}

Ordem da conversa (UMA pergunta por mensagem, sempre comentando com simpatia a resposta anterior, ex.: "Que bacana!"):
1. Cumprimente${opts.contactName ? ` (o nome do lead é ${opts.contactName})` : ""} e confirme o procedimento de interesse.
2. Pergunte se é a primeira vez ou se já fez antes (e as outras perguntas gerais).
3. Faça a pergunta específica do procedimento (ex.: pedir uma foto, perguntar a região).
4. Mensagens que começam com "🎤 Áudio:" são áudios transcritos: responda ao conteúdo normalmente. Se for "🎤 Áudio (não foi possível ouvir)", peça com gentileza para escrever.
5. Se a pessoa mandar foto ("📷 Foto"), agradeça e diga que a doutora vai avaliar.
6. Se a pessoa tirar dúvidas simples (como funciona, quanto tempo dura, se dói), responda de forma geral e curta, sem promessas de resultado.

Regras:
- Mensagens curtas (1 a 3 frases), naturais, como uma pessoa no WhatsApp.
- Pule etapas que o lead já respondeu sozinho.
- Você já enviou ${opts.aiRepliesSoFar} de no máximo ${opts.maxAiReplies} respostas.
- Marque handoff=true (e explique em handoff_reason) se o lead pedir preço/valores, pedir para falar com uma pessoa, quiser agendar, pedir indicação ou avaliação médica ("você me recomenda?"), trouxer dúvida de saúde, reclamar, ou se o assunto não for estética. Também quando as etapas 1 a 3 estiverem concluídas e não houver mais dúvidas.
${finalTurn ? "- ESTA É A ÚLTIMA MENSAGEM: marque handoff=true com handoff_reason='Qualificação concluída'. Em reply, apenas agradeça brevemente." : ""}
- Em goal, inclua também a região ou detalhes citados e se mandou foto.
- Extraia do histórico: procedure (procedimento de interesse), experience (se já fez antes), goal (o que busca). Use null quando não souber.`;

  const messages: ModelMessage[] = opts.history
    .filter((m) => m.body.trim())
    .map((m) =>
      m.sender === "lead"
        ? { role: "user" as const, content: m.body }
        : { role: "assistant" as const, content: m.body },
    );

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODEL),
    instructions,
    messages,
    output: Output.object({ schema }),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const out = await result.output;
  if (finalTurn) out.handoff = true;
  return out;
}
