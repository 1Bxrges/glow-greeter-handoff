// Server-only: durable processing of WhatsApp webhook events.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runSecretary, type AiDecision } from "./ai-secretary.server";
import { sendWhatsAppAudio, sendWhatsAppText, showTyping, type SendResult } from "./whatsapp.server";
import { aiAllowedFor } from "./rules/test-mode";

type DB = SupabaseClient<Database>;
type ClinicAudio = Database["public"]["Tables"]["clinic_audios"]["Row"];

export const AUDIO_BUCKET = "clinic-audios";
/** The worker only keeps running ~30s after answering the webhook, so the wait is capped. */
export const MAX_REPLY_DELAY_SECONDS = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Saves an outbound row, sends it, and records the result. Returns the send result. */
async function deliver(
  db: DB,
  conv: { id: string; wa_phone: string },
  row: { body: string; audio_id?: string | null },
  send: () => Promise<SendResult>,
  beforeSend?: Promise<unknown>,
): Promise<SendResult> {
  // The outbound row is saved while `beforeSend` (state that must be recorded first) finishes.
  const [{ data: outRow, error: outErr }] = await Promise.all([
    db
      .from("messages")
      .insert({ conversation_id: conv.id, direction: "out", sender: "ia", body: row.body, audio_id: row.audio_id ?? null, status: "sending" })
      .select("id")
      .single(),
    beforeSend,
  ]);
  if (outErr || !outRow) throw outErr ?? new Error("mensagem não salva");
  const sent = await send();
  if (!sent.ok) {
    await db.from("messages").update({ status: sent.definite ? "failed" : "unknown", error: sent.error }).eq("id", outRow.id);
    return sent;
  }
  const { error: idErr } = await db.from("messages").update({ wa_message_id: sent.waMessageId, status: "accepted" }).eq("id", outRow.id);
  if (idErr) throw idErr;
  await applyStatuses(db, sent.waMessageId);
  await db.from("conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: row.body.slice(0, 140) }).eq("id", conv.id);
  return sent;
}

/** Sends one of the doctor's recorded audios through a temporary link to the stored file. */
async function deliverAudio(db: DB, conv: { id: string; wa_phone: string }, audio: ClinicAudio): Promise<SendResult> {
  const { data: signed, error } = await db.storage.from(AUDIO_BUCKET).createSignedUrl(audio.storage_path, 3600);
  if (error || !signed?.signedUrl) return { ok: false, definite: true, error: `Áudio indisponível: ${error?.message ?? "sem link"}` };
  return deliver(db, conv, { body: `🎙️ Áudio enviado: ${audio.title}`, audio_id: audio.id }, () =>
    sendWhatsAppAudio(conv.wa_phone, signed.signedUrl, audio.mime_type),
  );
}
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
  const inbound: any[] = value.messages ?? [];
  if (!inbound.length) return;
  // Settings and the first conversation are looked up at the same time.
  const firstConv = upsertConversation(db, inbound[0].from, names.get(inbound[0].from) ?? null);
  firstConv.catch(() => {}); // the error is handled where it is awaited below
  const { data: settings, error: setErr } = await db.from("clinic_settings").select("test_mode, test_numbers").eq("id", 1).single();
  if (setErr) throw setErr;
  for (const [i, m] of inbound.entries()) {
    let conv = i === 0 ? await firstConv : await upsertConversation(db, m.from, names.get(m.from) ?? null);
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
    const reopen = conv.mode === "encerrada";
    const [{ error }] = await Promise.all([
      db.from("messages").upsert(
        { conversation_id: conv.id, direction: "in", sender: "lead", body, wa_message_id: m.id, status: "received", created_at: created, reply_state: wantsReply },
        { onConflict: "wa_message_id", ignoreDuplicates: true },
      ),
      db
        .from("conversations")
        .update({
          last_message_at: created,
          last_inbound_at: created,
          last_message_preview: body.slice(0, 140),
          ...(reopen ? { mode: "aguardando_humano", handoff_reason: "Lead voltou a escrever", handoff_at: new Date().toISOString(), followup_sent_at: null } : {}),
        })
        .eq("id", conv.id),
    ]);
    if (error) throw error;
  }
}

/** Claims and answers one pending inbound message. Safe to call repeatedly. */
export async function processReply(db: DB, messageId: string) {
  // Reply delay: wait until the lead's message is old enough (the minute job picks it up).
  const [{ data: pre }, { data: delaySet }] = await Promise.all([
    db.from("messages").select("created_at").eq("id", messageId).maybeSingle(),
    db.from("clinic_settings").select("reply_delay_seconds").eq("id", 1).single(),
  ]);
  if (pre && delaySet && !replyIsDue(pre.created_at, delaySet.reply_delay_seconds)) return;
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

  // Human-like pause, counted from when the lead wrote. Retries of old messages don't wait again.
  const delayMs = Math.min(Math.max(settings.reply_delay_seconds, 0), MAX_REPLY_DELAY_SECONDS) * 1000;
  const waitMs = delayMs - (Date.now() - new Date(claimed.created_at).getTime());
  if (waitMs > 500) {
    if (claimed.wa_message_id) await showTyping(claimed.wa_message_id);
    await sleep(waitMs);
    // Someone may have taken over while we waited.
    const { data: fresh, error: fErr } = await db.from("conversations").select("mode").eq("id", conv.id).single();
    if (fErr) throw fErr;
    if (fresh.mode !== "ia") return finish("skipped");
  }

  // A newer lead message will be answered with the full context instead.
  const [{ data: newer }, { data: history, error: hErr }, { data: audios, error: aErr }] = await Promise.all([
    db.from("messages").select("id").eq("conversation_id", conv.id).eq("sender", "lead").gt("created_at", claimed.created_at).limit(1),
    db.from("messages").select("sender, body").eq("conversation_id", conv.id).order("created_at", { ascending: true }).limit(60),
    db.from("clinic_audios").select("*").order("created_at", { ascending: true }).limit(20),
  ]);
  if (newer?.length) return finish("skipped");
  if (hErr) throw hErr;
  if (aErr) throw aErr;

  let decision: AiDecision;
  try {
    decision = await runSecretary({
      settings,
      audios: audios ?? [],
      history: history as any,
      aiRepliesSoFar: conv.ai_replies,
      maxAiReplies: settings.max_ai_replies,
      contactName: conv.contact_name,
      audios,
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
  const recordProgress = async () => {
    const { error: preErr } = await db
    .from("conversations")
    .update({
      ...summary,
      ai_replies: conv.ai_replies + (decision.handoff ? 0 : 1),
      ...(decision.handoff
        ? { mode: "aguardando_humano", handoff_reason: decision.handoff_reason ?? "Qualificação concluída", handoff_at: new Date().toISOString(), followup_sent_at: null }
        : {}),
    })
    .eq("id", conv.id);
    if (preErr) throw preErr;
  };

  const audio = !decision.handoff && decision.audio != null ? (audios ?? [])[decision.audio - 1] : undefined;

  if (!text) await recordProgress();
  if (text) {
    // Progress, the reply marker and the outbound row are all saved together, then the message goes out.
    const sent = await deliver(db, conv, { body: text }, () => sendWhatsAppText(conv.wa_phone, text), Promise.all([recordProgress(), finish("sent_pending")]));
    if (!sent.ok) {
      await db.from("conversations").update({ mode: "aguardando_humano", handoff_reason: sent.definite ? "Falha ao enviar resposta da IA" : "Envio da IA incerto, confira", handoff_at: new Date().toISOString() }).eq("id", conv.id);
      return finish(sent.definite ? "failed_send" : "unknown", sent.error);
    }
  }

  if (audio) {
    await finish("sent_pending");
    // The text already went out, so a failed audio is only logged on its own message row.
    const sentAudio = await deliverAudio(db, conv, audio);
    if (!sentAudio.ok) console.error("audio send failed", sentAudio.error);
  }

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

  try {
    await sendDueFollowups(db);
  } catch (e) {
    console.error("follow-up failed", e);
  }
}

/**
 * "Wait" message: when a lead has been waiting for the team longer than the configured time,
 * sends one message (text, or a recorded audio) so the lead doesn't go cold. Once per handoff.
 * There is no background queue, so this runs on webhook calls, on the cron route and while the panel is open.
 */
export async function sendDueFollowups(db: DB): Promise<number> {
  const { data: settings, error: sErr } = await db.from("clinic_settings").select("*").eq("id", 1).single();
  if (sErr) throw sErr;
  if (!settings.followup_enabled || !settings.ai_enabled) return 0;

  const now = Date.now();
  const dueBefore = new Date(now - Math.max(settings.followup_minutes, 1) * 60_000).toISOString();
  // Never wake up old conversations when the option is switched on.
  const notOlderThan = new Date(now - 6 * 3600_000).toISOString();
  const { data: due, error } = await db
    .from("conversations")
    .select("id, wa_phone")
    .eq("mode", "aguardando_humano")
    .is("followup_sent_at", null)
    .lt("handoff_at", dueBefore)
    .gt("handoff_at", notOlderThan)
    .gt("last_inbound_at", notOlderThan)
    .order("handoff_at", { ascending: true })
    .limit(5);
  if (error) throw error;

  let audio: ClinicAudio | null = null;
  if (settings.followup_audio_id) {
    const { data } = await db.from("clinic_audios").select("*").eq("id", settings.followup_audio_id).maybeSingle();
    audio = data ?? null;
  }
  const text = settings.followup_text.trim();
  if (!audio && !text) return 0;

  let count = 0;
  for (const conv of due ?? []) {
    if (!aiAllowedFor(conv.wa_phone, settings.test_mode, settings.test_numbers)) continue;
    // Claim first: only one caller gets the row, so the lead never receives it twice.
    const { data: claimed, error: cErr } = await db
      .from("conversations")
      .update({ followup_sent_at: new Date().toISOString() })
      .eq("id", conv.id)
      .eq("mode", "aguardando_humano")
      .is("followup_sent_at", null)
      .select("id")
      .maybeSingle();
    if (cErr) throw cErr;
    if (!claimed) continue;
    const sent = audio
      ? await deliverAudio(db, conv, audio)
      : await deliver(db, conv, { body: text }, () => sendWhatsAppText(conv.wa_phone, text));
    if (sent.ok) count++;
    else console.error("follow-up send failed", sent.error);
  }
  return count;
}

export function replyIsDue(createdAt: string, delaySeconds: number, now = Date.now()) {
  return now - new Date(createdAt).getTime() >= Math.max(0, delaySeconds) * 1000;
}

type Audio = { id: string; title: string; storage_path: string; mime_type: string };

/** Sends a recorded clinic audio and records it in the conversation. */
export async function sendClinicAudio(db: DB, convId: string, phone: string, audio: Audio, sender: "ia" | "humano") {
  const { data: signed, error: sErr } = await db.storage.from("clinic-audios").createSignedUrl(audio.storage_path, 3600);
  if (sErr || !signed) throw sErr ?? new Error("sem link do áudio");
  const body = `🎤 Áudio enviado: ${audio.title}`;
  const { data: row, error } = await db
    .from("messages")
    .insert({ conversation_id: convId, direction: "out", sender, body, status: "sending", audio_id: audio.id })
    .select("id")
    .single();
  if (error) throw error;
  const sent = await sendWhatsAppAudio(phone, signed.signedUrl, audio.mime_type);
  if (!sent.ok) {
    await db.from("messages").update({ status: sent.definite ? "failed" : "unknown", error: sent.error }).eq("id", row.id);
    return false;
  }
  await db.from("messages").update({ wa_message_id: sent.waMessageId, status: "accepted" }).eq("id", row.id);
  await applyStatuses(db, sent.waMessageId);
  await db.from("conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: body }).eq("id", convId);
  return true;
}

/** Runs every minute: delayed AI replies and the "still in consultation" follow-up. */
export async function runTick(db: DB) {
  const { data: settings, error } = await db.from("clinic_settings").select("*").eq("id", 1).single();
  if (error) throw error;

  const dueBefore = new Date(Date.now() - settings.reply_delay_seconds * 1000).toISOString();
  const { data: due } = await db
    .from("messages")
    .select("id")
    .eq("reply_state", "pending")
    .lte("created_at", dueBefore)
    .order("created_at", { ascending: true })
    .limit(10);
  for (const r of due ?? []) await processReply(db, r.id);

  if (!settings.followup_enabled) return;
  const waitedSince = new Date(Date.now() - settings.followup_minutes * 60_000).toISOString();
  const { data: convs } = await db
    .from("conversations")
    .select("id, wa_phone, handoff_at")
    .eq("mode", "aguardando_humano")
    .is("followup_sent_at", null)
    .lte("handoff_at", waitedSince)
    .gte("handoff_at", new Date(Date.now() - 20 * 3600_000).toISOString()) // stay inside WhatsApp's 24h window
    .limit(5);
  const audio = settings.followup_audio_id
    ? (await db.from("clinic_audios").select("*").eq("id", settings.followup_audio_id).maybeSingle()).data
    : null;
  for (const c of convs ?? []) {
    if (!aiAllowedFor(c.wa_phone, settings.test_mode, settings.test_numbers)) continue;
    // Claim first so the follow-up goes out at most once.
    const { data: claimed } = await db
      .from("conversations")
      .update({ followup_sent_at: new Date().toISOString() })
      .eq("id", c.id)
      .is("followup_sent_at", null)
      .eq("mode", "aguardando_humano")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    if (audio) {
      await sendClinicAudio(db, c.id, c.wa_phone, audio, "ia");
    } else if (settings.followup_text.trim()) {
      const text = settings.followup_text.trim();
      const { data: row } = await db.from("messages").insert({ conversation_id: c.id, direction: "out", sender: "ia", body: text, status: "sending" }).select("id").single();
      const sent = await sendWhatsAppText(c.wa_phone, text);
      if (row) {
        await db.from("messages").update(sent.ok ? { wa_message_id: sent.waMessageId, status: "accepted" } : { status: sent.definite ? "failed" : "unknown", error: sent.error }).eq("id", row.id);
      }
      if (sent.ok) await db.from("conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: text.slice(0, 140) }).eq("id", c.id);
    }
  }
}
