// Server-only: durable processing of WhatsApp webhook events.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runSecretary } from "./ai-secretary.server";
import { sendWhatsAppText } from "./whatsapp.server";
import { aiAllowedFor } from "./rules/test-mode";

type DB = SupabaseClient<Database>;
const STATUS_RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

function textOf(m: any): string {
  if (m.type === "text") return m.text?.body ?? "";
  if (m.type === "button") return m.button?.text ?? "";
  if (m.type === "interactive")
    return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
  if (m.type === "reaction") return `Reagiu ${m.reaction?.emoji ?? ""}`;
  const media = m[m.type];
  const label: Record<string, string> = { image: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📄 Documento", sticker: "Figurinha" };
  return `${label[m.type] ?? `[${m.type}]`}${media?.caption ? `: ${media.caption}` : ""}`;
}

async function upsertConversation(db: DB, phone: string, name: string | null) {
  const { data: existing, error } = await db.from("conversations").select("*").eq("wa_phone", phone).maybeSingle();
  if (error) throw error;
  if (existing) {
    if (name && !existing.contact_name) await db.from("conversations").update({ contact_name: name }).eq("id", existing.id);
    return existing;
  }
  const { data, error: insErr } = await db
    .from("conversations")
    .upsert({ wa_phone: phone, contact_name: name }, { onConflict: "wa_phone" })
    .select("*")
    .single();
  if (insErr) throw insErr;
  return data;
}

export async function applyStatuses(db: DB, waMessageId: string) {
  const { data: events, error } = await db.from("message_status_events").select("*").eq("wa_message_id", waMessageId);
  if (error) throw error;
  if (!events?.length) return;
  const best = events.reduce((a, b) => ((STATUS_RANK[b.status] ?? 0) > (STATUS_RANK[a.status] ?? 0) ? b : a));
  const failed = events.find((e) => e.status === "failed");
  const { error: upErr } = await db
    .from("messages")
    .update({
      status: best.status,
      status_at: best.status_ts,
      error: failed?.errors ? JSON.stringify(failed.errors).slice(0, 1000) : null,
    })
    .eq("wa_message_id", waMessageId);
  if (upErr) throw upErr;
}

async function handleStatuses(db: DB, value: any) {
  for (const s of value.statuses ?? []) {
    const ts = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null;
    // ignoreDuplicates keeps the first provider timestamp on replays.
    const { error } = await db
      .from("message_status_events")
      .upsert({ wa_message_id: s.id, status: s.status, status_ts: ts, errors: s.errors ?? null }, { onConflict: "wa_message_id,status", ignoreDuplicates: true });
    if (error) throw error;
    await applyStatuses(db, s.id); // no-op if the outbound row isn't saved yet
  }
}

async function handleEchoes(db: DB, value: any) {
  for (const m of value.message_echoes ?? []) {
    const conv = await upsertConversation(db, m.to, null);
    const body = textOf(m);
    const { error } = await db.from("messages").upsert(
      { conversation_id: conv.id, direction: "out", sender: "humano", body, wa_message_id: m.id, status: "sent" },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    await db
      .from("conversations")
      .update({ mode: conv.mode === "encerrada" ? "encerrada" : "humano", last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 140) })
      .eq("id", conv.id);
  }
}

async function handleInbound(db: DB, value: any) {
  const names = new Map<string, string>();
  for (const c of value.contacts ?? []) if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
  const { data: settings, error: setErr } = await db.from("clinic_settings").select("test_mode, test_numbers").eq("id", 1).single();
  if (setErr) throw setErr;
  for (const m of value.messages ?? []) {
    let conv = await upsertConversation(db, m.from, names.get(m.from) ?? null);
    // Test mode: other numbers are left to the team, silently.
    if (conv.mode === "ia" && !aiAllowedFor(m.from, settings.test_mode, settings.test_numbers)) {
      const { error } = await db.from("conversations").update({ mode: "humano" }).eq("id", conv.id);
      if (error) throw error;
      conv = { ...conv, mode: "humano" };
    }
    let body = textOf(m);
    if (m.type === "audio" && m.audio?.id) {
      const { data: seen } = await db.from("messages").select("id").eq("wa_message_id", m.id).maybeSingle();
      if (!seen) {
        try {
          const { transcribeWhatsAppAudio } = await import("./audio.server");
          const t = await transcribeWhatsAppAudio(m.audio.id);
          body = t ? `🎤 Áudio: "${t}"` : "🎤 Áudio (sem fala identificada)";
        } catch (e) {
          console.error("audio transcription failed", e);
          body = "🎤 Áudio (não foi possível ouvir)";
        }
      }
    }
    const created = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString();
    const wantsReply = conv.mode === "ia" ? "pending" : "none";
    const { error } = await db.from("messages").upsert(
      { conversation_id: conv.id, direction: "in", sender: "lead", body, wa_message_id: m.id, status: "received", created_at: created, reply_state: wantsReply },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    const reopen = conv.mode === "encerrada";
    await db
      .from("conversations")
      .update({
        last_message_at: created,
        last_inbound_at: created,
        last_message_preview: body.slice(0, 140),
        ...(reopen ? { mode: "aguardando_humano", handoff_reason: "Lead voltou a escrever", handoff_at: new Date().toISOString() } : {}),
      })
      .eq("id", conv.id);
  }
}

/** Claims and answers one pending inbound message. Safe to call repeatedly. */
export async function processReply(db: DB, messageId: string) {
  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: claimed, error: claimErr } = await db
    .from("messages")
    .update({ reply_state: "sending", reply_started_at: new Date().toISOString(), reply_error: null })
    .eq("id", messageId)
    .or(`reply_state.in.(pending,failed),and(reply_state.eq.sending,reply_started_at.lt.${staleBefore})`)
    .select("*")
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) return; // someone else has it, or it's done

  const finish = async (state: string, err?: string) => {
    const { error } = await db.from("messages").update({ reply_state: state, reply_error: err ?? null }).eq("id", messageId);
    if (error) throw error;
  };

  const [{ data: conv, error: cErr }, { data: settings, error: sErr }] = await Promise.all([
    db.from("conversations").select("*").eq("id", claimed.conversation_id).single(),
    db.from("clinic_settings").select("*").eq("id", 1).single(),
  ]);
  if (cErr) throw cErr;
  if (sErr) throw sErr;
  if (conv.mode !== "ia" || !settings.ai_enabled) return finish("skipped");
  if (!aiAllowedFor(conv.wa_phone, settings.test_mode, settings.test_numbers)) return finish("skipped");

  // A newer lead message will be answered with the full context instead.
  const { data: newer } = await db
    .from("messages")
    .select("id")
    .eq("conversation_id", conv.id)
    .eq("sender", "lead")
    .gt("created_at", claimed.created_at)
    .limit(1);
  if (newer?.length) return finish("skipped");

  const { data: history, error: hErr } = await db
    .from("messages")
    .select("sender, body")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(60);
  if (hErr) throw hErr;

  let decision;
  try {
    decision = await runSecretary({
      settings,
      history: history as any,
      aiRepliesSoFar: conv.ai_replies,
      maxAiReplies: settings.max_ai_replies,
      contactName: conv.contact_name,
    });
  } catch (e) {
    console.error("AI error", e);
    // Don't leave the lead waiting: hand the conversation to the team.
    await db.from("conversations").update({ mode: "aguardando_humano", handoff_reason: "A IA não conseguiu responder", handoff_at: new Date().toISOString() }).eq("id", conv.id);
    return finish("failed_ai", String(e).slice(0, 500));
  }

  const summary = {
    procedure: decision.procedure ?? conv.procedure,
    experience: decision.experience ?? conv.experience,
    goal: decision.goal ?? conv.goal,
  };

  let text = decision.reply.trim();
  if (decision.handoff) {
    text = settings.send_handoff_message ? settings.handoff_message : "";
  }

  // Record progress before sending so an interrupted run never loses the conversation state.
  const { error: preErr } = await db
    .from("conversations")
    .update({
      ...summary,
      ai_replies: conv.ai_replies + (decision.handoff ? 0 : 1),
      ...(decision.handoff
        ? { mode: "aguardando_humano", handoff_reason: decision.handoff_reason ?? "Qualificação concluída", handoff_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", conv.id);
  if (preErr) throw preErr;

  if (text) {
    const { data: outRow, error: outErr } = await db
      .from("messages")
      .insert({ conversation_id: conv.id, direction: "out", sender: "ia", body: text, status: "sending" })
      .select("id")
      .single();
    if (outErr) throw outErr;
    await finish("sent_pending");
    const sent = await sendWhatsAppText(conv.wa_phone, text);
    if (!sent.ok) {
      await db.from("messages").update({ status: sent.definite ? "failed" : "unknown", error: sent.error }).eq("id", outRow.id);
      await db.from("conversations").update({ mode: "aguardando_humano", handoff_reason: sent.definite ? "Falha ao enviar resposta da IA" : "Envio da IA incerto, confira", handoff_at: new Date().toISOString() }).eq("id", conv.id);
      return finish(sent.definite ? "failed_send" : "unknown", sent.error);
    }
    const { error: idErr } = await db.from("messages").update({ wa_message_id: sent.waMessageId, status: "accepted" }).eq("id", outRow.id);
    if (idErr) throw idErr;
    await applyStatuses(db, sent.waMessageId);
  }

  const { error: upErr } = await db
    .from("conversations")
    .update(text ? { last_message_at: new Date().toISOString(), last_message_preview: text.slice(0, 140) } : {})
    .eq("id", conv.id);
  if (upErr) throw upErr;
  await finish("done");
}

async function processPendingRepliesForEvent(db: DB, payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const ids = (value?.messages ?? []).map((m: any) => m.id);
  if (!ids.length) return;
  const { data } = await db.from("messages").select("id").in("wa_message_id", ids).in("reply_state", ["pending", "failed", "sending"]);
  for (const row of data ?? []) await processReply(db, row.id);
}

export async function processEvent(db: DB, event: string, payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value ?? {};
  if (event === "whatsapp.message" || value.messages) await handleInbound(db, value);
  if (event === "whatsapp.status" || value.statuses) await handleStatuses(db, value);
  if (event === "whatsapp.smb_message_echoes") await handleEchoes(db, value);
  await processPendingRepliesForEvent(db, payload);
}

export async function processStoredEvent(db: DB, row: { id: string; event: string; payload: any; attempts: number }) {
  await db.from("whatsapp_webhook_events").update({ attempts: row.attempts + 1, last_attempt_at: new Date().toISOString() }).eq("id", row.id);
  try {
    await processEvent(db, row.event, row.payload);
    const { error } = await db.from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null }).eq("id", row.id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("webhook processing failed", e);
    await db.from("whatsapp_webhook_events").update({ processing_error: String((e as any)?.message ?? e).slice(0, 1000) }).eq("id", row.id);
    return false;
  }
}

/** Bounded recovery for unfinished work, run on each webhook call. Least-recently-tried first. */
export async function recoverPending(db: DB, excludeId: string) {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data: events } = await db
    .from("whatsapp_webhook_events")
    .select("id, event, payload, attempts")
    .is("processed_at", null)
    .neq("id", excludeId)
    .lt("attempts", 8)
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${cutoff}`)
    .order("last_attempt_at", { ascending: true, nullsFirst: true })
    .limit(2);
  for (const ev of events ?? []) await processStoredEvent(db, ev);

  const stale = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: replies } = await db
    .from("messages")
    .select("id")
    .or(`reply_state.eq.pending,and(reply_state.eq.sending,reply_started_at.lt.${stale})`)
    .lt("created_at", cutoff)
    .order("reply_started_at", { ascending: true, nullsFirst: true })
    .limit(2);
  for (const r of replies ?? []) await processReply(db, r.id);
}
