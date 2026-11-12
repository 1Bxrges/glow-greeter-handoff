// Server-only: WhatsApp sends through the Lovable connector gateway.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

export type SendResult =
  | { ok: true; waMessageId: string }
  | { ok: false; definite: boolean; error: string };

export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const waKey = process.env['WHATSAPP_API_KEY'];
  if (!lovableKey || !waKey) return { ok: false, definite: true, error: "WhatsApp não configurado" };
  let response: Response;
  try {
    response = await fetch(`${GATEWAY_URL}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": waKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "text",
        text: { body },
      }),
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
