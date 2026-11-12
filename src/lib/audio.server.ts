// Server-only: download a WhatsApp voice note and transcribe it with Lovable AI.
const WA = "https://connector-gateway.lovable.dev/whatsapp";
const MAX_BYTES = 16 * 1024 * 1024;

function waHeaders() {
  return {
    Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
    "X-Connection-Api-Key": process.env["WHATSAPP_API_KEY"] ?? "",
  };
}

async function readBounded(res: Response) {
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Áudio grande demais");
    }
    chunks.push(value);
  }
  return chunks;
}

export async function transcribeWhatsAppAudio(mediaId: string): Promise<string> {
  const meta = await fetch(`${WA}/media/${encodeURIComponent(mediaId)}`, { headers: waHeaders() });
  if (!meta.ok) throw new Error(`media lookup [${meta.status}] ${await meta.text()}`);
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url) throw new Error("media sem url");
  if (info.file_size && info.file_size > MAX_BYTES) throw new Error("Áudio grande demais");

  const dl = await fetch(`${WA}/media_download`, { headers: { ...waHeaders(), "X-WhatsApp-Media-URL": info.url } });
  if (!dl.ok || !dl.body) throw new Error(`media download [${dl.status}]`);
  const mime = (info.mime_type ?? dl.headers.get("content-type") ?? "audio/ogg").split(";")[0]!.trim();
  const chunks = await readBounded(dl);
  const ext = mime.includes("mpeg") ? "mp3" : mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("amr") ? "amr" : "ogg";
  const file = new File(chunks as BlobPart[], `audio.${ext}`, { type: mime });

  const form = new FormData();
  form.append("model", "openai/gpt-transcribe");
  form.append("file", file, file.name);
  form.append("response_format", "json");
  form.append("stream", "true");
  form.append("languages", "pt");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}` },
    body: form,
  });
  if (!res.ok || !res.body) throw new Error(`transcription [${res.status}] ${await res.text()}`);

  // Consume SSE: collect deltas, prefer the final "done" text.
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buf = "", deltas = "", done = "";
  while (true) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "transcript.text.delta" && ev.delta) deltas += ev.delta;
        if (ev.type === "transcript.text.done" && ev.text) done = ev.text;
        if (ev.type === "error" || ev.error) throw new Error(JSON.stringify(ev.error ?? ev));
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return (done || deltas).trim();
}
