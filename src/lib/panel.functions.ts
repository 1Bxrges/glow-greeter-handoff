import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

const BUCKET = "clinic-audios";

async function assertStaff(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("role", "staff").limit(1);
  if (error || !data?.length) throw new Error("Sem acesso");
}

/** Makes sure the private storage bucket for recorded audios exists before the first upload. */
export const prepareAudioUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.storage.getBucket(BUCKET);
    if (!existing) {
      const { error } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 16 * 1024 * 1024 });
      if (error && !/exist/i.test(error.message)) throw new Error(`Não foi possível preparar o armazenamento: ${error.message}`);
    }
    return { ok: true };
  });

/** Temporary link so the team can listen to a recorded audio in the panel. */
export const getAudioUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: audio } = await supabaseAdmin.from("clinic_audios").select("storage_path").eq("id", data.id).maybeSingle();
    if (!audio) throw new Error("Áudio não encontrado");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(audio.storage_path, 600);
    if (error || !signed) throw new Error("Não foi possível abrir o áudio");
    return { url: signed.signedUrl };
  });

export const deleteAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: audio } = await supabaseAdmin.from("clinic_audios").select("storage_path").eq("id", data.id).maybeSingle();
    if (!audio) return { ok: true };
    await supabaseAdmin.from("clinic_settings").update({ followup_audio_id: null }).eq("id", 1).eq("followup_audio_id", data.id);
    const { error } = await supabaseAdmin.from("clinic_audios").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.storage.from(BUCKET).remove([audio.storage_path]);
    return { ok: true };
  });

/** Called by the open panel once a minute: sends the "wait" message to leads waiting too long. */
export const runFollowups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendDueFollowups } = await import("@/lib/webhook-processor.server");
    return { sent: await sendDueFollowups(supabaseAdmin) };
  });
