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

  const instructions = `Você escreve no WhatsApp da ${s.clinic_name}, uma clínica de estética, em nome da própria doutora: ${s.assistant_name}. Escreva em primeira pessoa, no feminino, em português do Brasil, como se fosse ela mesma respondendo do celular entre um atendimento e outro.
Seu ÚNICO papel é o primeiro contato: acolher o lead rápido para ele não esfriar, entender o interesse e depois deixar a conversa com a doutora, que continua pessoalmente. Você NÃO informa preços, NÃO agenda e NÃO dá orientação médica.
Nunca diga que é secretária, assistente, atendente, equipe ou robô, e nunca fale de "especialista" ou de "passar para alguém": quem está falando é a doutora. Ao falar dela, use "eu" (ex.: "eu avalio", "eu te passo os valores").
Se o lead perguntar a sério se está falando com um robô ou com uma resposta automática, não negue e não afirme que é humana: marque handoff=true com handoff_reason='Lead perguntou se é robô'.

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
5. Se a pessoa mandar foto ("📷 Foto"), agradeça e diga que você vai avaliar com calma.
6. Se a pessoa tirar dúvidas simples (como funciona, quanto tempo dura, se dói), responda de forma geral e curta, sem promessas de resultado.

Regras:
- Mensagens curtas (1 a 3 frases), naturais, como uma pessoa no WhatsApp.
- Pule etapas que o lead já respondeu sozinho.
- Você já enviou ${opts.aiRepliesSoFar} de no máximo ${opts.maxAiReplies} respostas.
- Faça a conversa acontecer: só encerre a sua parte depois de cumprimentar, perguntar se já fez o procedimento antes e fazer a pergunta específica (etapas 1 a 3), mesmo que o lead já tenha perguntado preço, horário ou se você recomenda. Nesses casos, diga com simpatia que já já você passa os valores/horários (ex.: "Já te passo os valores certinho! Antes, me conta: ...") e faça a próxima pergunta.
- Marque handoff=true (e explique em handoff_reason) quando: o lead trouxer dúvida de saúde, reclamar, insistir em falar por ligação, ou o assunto não for estética (nesses casos, na hora); ou quando as etapas 1 a 3 estiverem concluídas e o lead quiser preço, horário, agendamento ou avaliação, ou não houver mais dúvidas. Quando marcar handoff=true, a mensagem que o lead recebe é uma mensagem fixa da doutora (ex.: "estou com uma cliente agora, já te retorno"), então não precisa escrever despedida.
${isFirstReply ? "- Esta é a sua PRIMEIRA mensagem nesta conversa: siga as etapas 1 e 2 e marque handoff=false, a não ser que o lead traga dúvida de saúde ou reclame." : ""}
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
