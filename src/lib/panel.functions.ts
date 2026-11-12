import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const sendHumanReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: conv, error } = await supabase.from("conversations").select("id, wa_phone").eq("id", data.conversationId).single();
    if (error || !conv) throw new Error("Conversa não encontrada");
    const { sendWhatsAppText } = await import("@/lib/whatsapp.server");
    const sent = await sendWhatsAppText(conv.wa_phone, data.body);
    if (!sent.ok) {
      await supabase.from("messages").insert({ conversation_id: conv.id, direction: "out", sender: "humano", body: data.body, status: "failed", error: sent.error });
      throw new Error(sent.definite ? `Não foi possível enviar: ${sent.error}` : "Envio incerto, confira no WhatsApp antes de reenviar.");
    }
    const { error: insErr } = await supabase.from("messages").insert({
      conversation_id: conv.id, direction: "out", sender: "humano", body: data.body, wa_message_id: sent.waMessageId, status: "accepted",
    });
    if (insErr) throw new Error(insErr.message);
    await supabase.from("conversations").update({ mode: "humano", last_message_at: new Date().toISOString(), last_message_preview: data.body.slice(0, 140) }).eq("id", conv.id);
    // Status callbacks that arrived before this row existed.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { applyStatuses } = await import("@/lib/webhook-processor.server");
    await applyStatuses(supabaseAdmin, sent.waMessageId);
    return { ok: true };
  });
