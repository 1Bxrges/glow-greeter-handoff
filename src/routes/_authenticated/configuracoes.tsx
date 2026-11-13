import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TopBar } from "@/components/panel/TopBar";
import { NoAccess, useIsStaff } from "@/components/panel/useStaff";
import { deleteAudio, getAudioUrl, prepareAudioUpload } from "@/lib/panel.functions";

type Settings = Database["public"]["Tables"]["clinic_settings"]["Row"];
type Audio = Database["public"]["Tables"]["clinic_audios"]["Row"];

const MAX_DELAY = 15;
const AUDIO_BUCKET = "clinic-audios";
// Formats WhatsApp accepts. OGG (Opus) goes out as a voice note; the others as an audio file.
const AUDIO_TYPES: Record<string, string> = { ogg: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", amr: "audio/amr" };

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Buzzina" },
      { name: "description", content: "Ajuste procedimentos, perguntas e o tom da secretária de IA." },
      { property: "og:title", content: "Configurações — Buzzina" },
      { property: "og:description", content: "Ajuste procedimentos, perguntas e o tom da secretária de IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const staff = useIsStaff();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      {staff.data === false ? <NoAccess /> : <SettingsForm />}
    </div>
  );
}

function SettingsForm() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinic_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const audios = useQuery({
    queryKey: ["audios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinic_audios").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);
  if (!form) return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });

  async function save() {
    setSaving(true);
    const { id, updated_at, ...rest } = form!;
    const { error } = await supabase.from("clinic_settings").update({ ...rest, max_ai_replies: Math.min(5, Math.max(1, rest.max_ai_replies)), updated_at: new Date().toISOString() }).eq("id", 1);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar", { description: error.message });
      return;
    }
    toast.success("Configurações salvas");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Configurações da secretária</h1>
        <p className="mt-1 text-sm text-muted-foreground">A IA faz o primeiro contato, faz as perguntas abaixo e passa a conversa para você.</p>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">IA ligada</p>
            <p className="text-sm text-muted-foreground">Quando desligada, nenhuma conversa nova recebe resposta automática.</p>
          </div>
          <Switch checked={form.ai_enabled} onCheckedChange={(v) => set("ai_enabled", v)} />
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Modo teste</p>
            <p className="text-sm text-muted-foreground">A IA responde só os números abaixo. As outras pessoas ficam com você, sem resposta automática.</p>
          </div>
          <Switch checked={form.test_mode} onCheckedChange={(v) => set("test_mode", v)} />
        </div>
        {form.test_mode && (
          <F label="Números de teste (um por linha, com DDD)"><Textarea rows={2} value={form.test_numbers} onChange={(e) => set("test_numbers", e.target.value)} /></F>
        )}
      </Card>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <F label="Nome da clínica"><Input value={form.clinic_name} onChange={(e) => set("clinic_name", e.target.value)} /></F>
          <F label="Nome da secretária"><Input value={form.assistant_name} onChange={(e) => set("assistant_name", e.target.value)} /></F>
        </div>
        <F label="Tom de voz"><Textarea rows={2} value={form.tone} onChange={(e) => set("tone", e.target.value)} /></F>
        <F label="Procedimentos e pergunta específica (um por linha, no formato Procedimento: pergunta)"><Textarea rows={6} value={form.procedures} onChange={(e) => set("procedures", e.target.value)} /></F>
        <F label="Perguntas gerais, feitas antes da específica (uma por linha)"><Textarea rows={4} value={form.questions} onChange={(e) => set("questions", e.target.value)} /></F>
      </Card>

      <Card>
        <F label="Quantas respostas a IA dá antes de passar para você">
          <Input type="number" min={1} max={5} className="w-24" value={form.max_ai_replies} onChange={(e) => set("max_ai_replies", Number(e.target.value) || 1)} />
        </F>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Mandar mensagem de passagem</p>
            <p className="text-sm text-muted-foreground">Avisa o lead que a especialista vai continuar.</p>
          </div>
          <Switch checked={form.send_handoff_message} onCheckedChange={(v) => set("send_handoff_message", v)} />
        </div>
        {form.send_handoff_message && (
          <F label="Mensagem de passagem"><Textarea rows={2} value={form.handoff_message} onChange={(e) => set("handoff_message", e.target.value)} /></F>
        )}
      </Card>

      <Card>
        <F label={`Esperar antes de responder (segundos, de 0 a ${MAX_DELAY})`}>
          <Input type="number" min={0} max={MAX_DELAY} className="w-24" value={form.reply_delay_seconds} onChange={(e) => set("reply_delay_seconds", Math.min(MAX_DELAY, Math.max(0, Math.round(Number(e.target.value)) || 0)))} />
        </F>
        <p className="text-sm text-muted-foreground">A IA aparece como “digitando…” e responde depois desse tempo. O máximo é 15 segundos, porque o servidor só fica ligado uns 30 segundos depois de cada mensagem. Se o lead mandar várias mensagens seguidas, ela responde tudo de uma vez.</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Mensagem de espera</p>
            <p className="text-sm text-muted-foreground">Se ninguém assumir a conversa no tempo abaixo, a IA manda um aviso para o lead não esfriar. Uma vez por conversa.</p>
          </div>
          <Switch checked={form.followup_enabled} onCheckedChange={(v) => set("followup_enabled", v)} />
        </div>
        {form.followup_enabled && (
          <>
            <F label="Enviar depois de quantos minutos esperando">
              <Input type="number" min={1} max={300} className="w-24" value={form.followup_minutes} onChange={(e) => set("followup_minutes", Math.min(300, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
            </F>
            <F label="Texto da mensagem de espera"><Textarea rows={2} value={form.followup_text} onChange={(e) => set("followup_text", e.target.value)} /></F>
            <F label="Ou enviar um áudio gravado no lugar do texto">
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.followup_audio_id ?? ""} onChange={(e) => set("followup_audio_id", e.target.value || null)}>
                <option value="">Nenhum (enviar o texto)</option>
                {(audios.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </F>
            <p className="text-xs text-muted-foreground">O aviso sai quando chega alguma mensagem no WhatsApp ou enquanto o painel de atendimentos estiver aberto.</p>
          </>
        )}
      </Card>

      <AudiosCard audios={audios.data ?? []} onDeleted={(id) => { if (form.followup_audio_id === id) set("followup_audio_id", null); }} />

      <div className="flex justify-end">
        <Button className="rounded-full px-6" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </div>
    </main>
  );
}

function AudiosCard({ audios, onDeleted }: { audios: Audio[]; onDeleted: (id: string) => void }) {
  const qc = useQueryClient();
  const prepare = useServerFn(prepareAudioUpload);
  const getUrl = useServerFn(getAudioUrl);
  const remove = useServerFn(deleteAudio);
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [useWhen, setUseWhen] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);

  async function add() {
    if (!file || !title.trim()) { toast.error("Escolha o arquivo e dê um nome ao áudio"); return; }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = AUDIO_TYPES[ext];
    if (!mime) { toast.error("Formato não aceito pelo WhatsApp", { description: "Use OGG, MP3, M4A, AAC ou AMR." }); return; }
    if (file.size > 16 * 1024 * 1024) { toast.error("Áudio grande demais (máximo 16 MB)"); return; }
    setBusy(true);
    try {
      await prepare();
      const path = `${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(AUDIO_BUCKET).upload(path, file, { contentType: mime });
      if (up.error) throw up.error;
      const { error } = await supabase.from("clinic_audios").insert({ title: title.trim(), use_when: useWhen.trim(), storage_path: path, mime_type: mime });
      if (error) throw error;
      setTitle(""); setUseWhen(""); setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      toast.success("Áudio adicionado");
      qc.invalidateQueries({ queryKey: ["audios"] });
    } catch (e) {
      toast.error("Não foi possível adicionar o áudio", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function play(id: string) {
    try {
      const { url } = await getUrl({ data: { id } });
      setPlaying({ id, url });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function del(a: Audio) {
    if (!confirm(`Apagar o áudio “${a.title}”?`)) return;
    try {
      await remove({ data: { id: a.id } });
      onDeleted(a.id);
      qc.invalidateQueries({ queryKey: ["audios"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <div>
        <p className="font-semibold">Áudios gravados</p>
        <p className="text-sm text-muted-foreground">Áudios da doutora que a IA pode enviar durante a conversa. Em “quando usar”, diga em que momento ele entra. Arquivos OGG chegam como mensagem de voz; MP3 e M4A chegam como arquivo de áudio.</p>
      </div>
      {audios.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {audios.map((a) => (
            <li key={a.id} className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.use_when || "Sem indicação de quando usar"}</p>
                </div>
                <Button type="button" size="icon" variant="ghost" aria-label="Ouvir" onClick={() => play(a.id)}><Play className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Apagar" onClick={() => del(a)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {playing?.id === a.id && <audio controls autoPlay src={playing.url} className="w-full" />}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Nome do áudio"><Input value={title} placeholder="Boas-vindas da doutora" onChange={(e) => setTitle(e.target.value)} /></F>
        <F label="Arquivo"><Input ref={fileInput} type="file" accept=".ogg,.opus,.mp3,.m4a,.aac,.amr,audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></F>
      </div>
      <F label="Quando usar"><Textarea rows={2} value={useWhen} placeholder="Logo depois de o lead dizer qual procedimento quer" onChange={(e) => setUseWhen(e.target.value)} /></F>
      <div className="flex justify-end">
        <Button type="button" variant="outline" className="rounded-full" onClick={add} disabled={busy}><Upload className="h-4 w-4" /> {busy ? "Enviando…" : "Adicionar áudio"}</Button>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">{children}</section>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
