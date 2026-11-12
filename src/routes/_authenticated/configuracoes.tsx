import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

type Settings = Database["public"]["Tables"]["clinic_settings"]["Row"];

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Secretária IA" },
      { name: "description", content: "Ajuste procedimentos, perguntas e o tom da secretária de IA." },
      { property: "og:title", content: "Configurações — Secretária IA" },
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
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);
  if (!form) return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });

  async function save() {
    setSaving(true);
    const { id, updated_at, ...rest } = form!;
    const { error } = await supabase.from("clinic_settings").update({ ...rest, max_ai_replies: Math.min(5, Math.max(1, rest.max_ai_replies)), updated_at: new Date().toISOString() }).eq("id", 1);
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar", { description: error.message });
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
        <div className="grid gap-4 sm:grid-cols-2">
          <F label="Nome da clínica"><Input value={form.clinic_name} onChange={(e) => set("clinic_name", e.target.value)} /></F>
          <F label="Nome da secretária"><Input value={form.assistant_name} onChange={(e) => set("assistant_name", e.target.value)} /></F>
        </div>
        <F label="Tom de voz"><Textarea rows={2} value={form.tone} onChange={(e) => set("tone", e.target.value)} /></F>
        <F label="Procedimentos (um por linha)"><Textarea rows={6} value={form.procedures} onChange={(e) => set("procedures", e.target.value)} /></F>
        <F label="Perguntas de qualificação (uma por linha, na ordem)"><Textarea rows={4} value={form.questions} onChange={(e) => set("questions", e.target.value)} /></F>
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

      <div className="flex justify-end">
        <Button className="rounded-full px-6" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">{children}</section>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
