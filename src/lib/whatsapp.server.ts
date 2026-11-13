// Server-only: WhatsApp sends through the Lovable connector gateway.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

export type SendResult =
  | { ok: true; waMessageId: string }
  | { ok: false; definite: boolean; error: string };

function gatewayHeaders() {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const waKey = process.env['WHATSAPP_API_KEY'];
  if (!lovableKey || !waKey) return null;
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": waKey,
    "Content-Type": "application/json",
  };
}

async function sendMessage(to: string, content: Record<string, unknown>): Promise<SendResult> {
  const headers = gatewayHeaders();
  if (!headers) return { ok: false, definite: true, error: "WhatsApp não configurado" };
  let response: Response;
  try {
    response = await fetch(`${GATEWAY_URL}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), ...content }),
    });
  } catch (e) {
    // Network failure: we can't know whether Meta accepted it.
    return { ok: false, definite: false, error: String(e) };
  }
  const text = await response.text();
  if (!response.ok) {
    console.error(`WhatsApp send failed [${response.status}]: ${text}`);
    return { ok: false, definite: true, error: `[${response.status}] ${text.slice(0, 500)}` };
  }
  try {
    const id = JSON.parse(text)?.messages?.[0]?.id as string | undefined;
    if (id) return { ok: true, waMessageId: id };
  } catch {}
  return { ok: false, definite: false, error: `Resposta inesperada: ${text.slice(0, 300)}` };
}

export function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  return sendMessage(to, { type: "text", text: { body } });
}

/** Sends an audio by public link. OGG/Opus files go out as a voice note. */
export function sendWhatsAppAudio(to: string, link: string, mimeType: string): Promise<SendResult> {
  const voice = mimeType.includes("ogg") || mimeType.includes("opus");
  return sendMessage(to, { type: "audio", audio: voice ? { link, voice: true } : { link } });
}

/** Best effort: marks the lead's message as read and shows "digitando…" while the reply is prepared. */
export async function showTyping(waMessageId: string): Promise<void> {
  const headers = gatewayHeaders();
  if (!headers) return;
  try {
    const res = await fetch(`${GATEWAY_URL}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: waMessageId,
        typing_indicator: { type: "text" },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.warn(`typing indicator not accepted [${res.status}]`);
  } catch (e) {
    console.warn("typing indicator failed", e);
  }
}
