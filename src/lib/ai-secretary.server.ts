// Server-only: AI first-contact secretary through Lovable AI Gateway (Responses API).
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const MODEL = "openai/gpt-6-astra";

const AI_OPTIONS = {
  forceReasoning: true,
  reasoningEffort: "low",
  reasoningSummary: "auto",
  store: false,
  include: ["reasoning.encrypted_content"],
};

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
  // Number (1-based) of a recorded audio to send after the text, or null.
  audio: z.number().int().nullable(),
});
export type AiDecision = z.infer<typeof schema>;

export type AudioOption = { title: string; use_when: string };

export async function runSecretary(opts: {
  audios?: AudioOption[];
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
  const audios = opts.audios ?? [];
  const audioBlock = audios.length
    ? `
Áudios gravados pela doutora que você pode enviar (o áudio vai logo depois do seu texto):
${audios.map((a, i) => `${i + 1}. "${a.title}" — quando usar: ${a.use_when || "quando combinar com o momento da conversa"}`).join("\n")}
- Para enviar, coloque o número do áudio em audio. Envie no máximo um por mensagem, só quando o momento combinar com "quando usar".
- Nunca repita um áudio que já aparece no histórico como "🎙️ Áudio enviado".
- Quando enviar um áudio, seu texto deve ser curto e não repetir o que o áudio já diz.
`
    : "";

  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(now));
  const greeting = hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite";
  const isFirstReply = !opts.history.some((m) => m.sender === "ia");

  const instructions = `Você é ${s.assistant_name}, a secretária virtual da ${s.clinic_name}, uma clínica de estética, falando pelo WhatsApp em português do Brasil.
Seu ÚNICO papel é o primeiro contato: acolher o lead rápido para ele não esfriar, entender o interesse e passar para a especialista. Você NÃO vende, NÃO informa preços, NÃO agenda e NÃO dá orientação médica.

Tom de voz: ${s.tone}

Procedimentos da clínica (formato "Procedimento: pergunta específica"):
${s.procedures}

Perguntas gerais (antes da pergunta específica):
${s.questions}

${audioBlock}
Ordem da conversa (UMA pergunta por mensagem, sempre comentando com simpatia a resposta anterior, ex.: "Que bacana!"):
Agora são ${hour}h em Brasília: o cumprimento certo é "${greeting}".
1. Na sua primeira mensagem, comece com "${greeting}"${opts.contactName ? ` e o primeiro nome do lead (${opts.contactName})` : ""}, de forma calorosa, e confirme o procedimento de interesse. Ex.: "${greeting}, Ana! Tudo bem? Fazemos botox sim 😊".
2. Na mesma mensagem, pergunte se é a primeira vez ou se já fez o procedimento antes (ex.: "Você já fez botox alguma vez?"). Depois, uma de cada vez, as outras perguntas gerais.
3. Faça a pergunta específica do procedimento (ex.: pedir uma foto, perguntar a região).
4. Mensagens que começam com "🎤 Áudio:" são áudios transcritos: responda ao conteúdo normalmente. Se for "🎤 Áudio (não foi possível ouvir)", peça com gentileza para escrever.
5. Se a pessoa mandar foto ("📷 Foto"), agradeça e diga que a doutora vai avaliar.
6. Se a pessoa tirar dúvidas simples (como funciona, quanto tempo dura, se dói), responda de forma geral e curta, sem promessas de resultado.

Regras:
- Mensagens curtas (1 a 3 frases), naturais, como uma pessoa no WhatsApp.
- Pule etapas que o lead já respondeu sozinho.
- Você já enviou ${opts.aiRepliesSoFar} de no máximo ${opts.maxAiReplies} respostas.
- Faça a conversa acontecer: só passe para a especialista depois de cumprimentar e perguntar se já fez o procedimento antes (etapas 1 e 2), mesmo que o lead já tenha perguntado preço, horário ou se você recomenda. Nesses casos, diga com simpatia que a especialista vai passar valores/horários/avaliação e, antes, faça a pergunta da etapa 2.
- Marque handoff=true (e explique em handoff_reason) quando: o lead pedir para falar com uma pessoa, trouxer dúvida de saúde, reclamar, ou o assunto não for estética (nesses casos, na hora); ou quando pedir preço, agendamento ou indicação/avaliação médica DEPOIS que as etapas 1 e 2 já foram feitas; ou quando as etapas 1 a 3 estiverem concluídas e não houver mais dúvidas.
${isFirstReply ? "- Esta é a sua PRIMEIRA mensagem nesta conversa: siga as etapas 1 e 2 e marque handoff=false, a não ser que o lead peça para falar com uma pessoa, traga dúvida de saúde ou reclame." : ""}
${finalTurn ? "- ESTA É A ÚLTIMA MENSAGEM: marque handoff=true com handoff_reason='Qualificação concluída'. Em reply, apenas agradeça brevemente." : ""}
- Em goal, inclua também a região ou detalhes citados e se mandou foto.
- Extraia do histórico: procedure (procedimento de interesse), experience (se já fez antes), goal (o que busca). Use null quando não souber.
- Em audio use null quando não for enviar áudio${audios.length ? "" : " (não há áudios cadastrados, use sempre null)"}.`;

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

  // Same model settings that answered on WhatsApp before. A faster "no reasoning" setting was
  // tried, but replies stopped finishing in production, so it is not used.
  const result = streamText({
    model: provider.responses(MODEL),
    instructions,
    messages,
    output: Output.object({ schema }),
    providerOptions: { openai: AI_OPTIONS },
    abortSignal: AbortSignal.timeout(12_000),
  });
  const out: AiDecision = await result.output;
  if (finalTurn) out.handoff = true;
  if (out.audio != null && (out.audio < 1 || out.audio > audios.length)) out.audio = null;
  return out;
}
