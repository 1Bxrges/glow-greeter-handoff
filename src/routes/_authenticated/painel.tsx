import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Bot, Check, CheckCheck, Hand, RotateCcw, Send, Sparkles, User, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/panel/TopBar";
import { NoAccess, useIsStaff } from "@/components/panel/useStaff";
import { MODE_META, beep, formatPhone, timeAgo, type Mode } from "@/components/panel/status";
import { sendHumanReply } from "@/lib/panel.functions";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type Message = Database["public"]["Tables"]["messages"]["Row"];

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Atendimentos — Secretária IA" },
      { name: "description", content: "Conversas do WhatsApp atendidas pela IA e as que precisam de você." },
      { property: "og:title", content: "Atendimentos — Secretária IA" },
      { property: "og:description", content: "Conversas do WhatsApp atendidas pela IA e as que precisam de você." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PanelPage,
});

const FILTERS: { key: "todas" | Mode; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "aguardando_humano", label: "Aguardando você" },
  { key: "ia", label: "IA" },
  { key: "humano", label: "Você" },
  { key: "encerrada", label: "Encerradas" },
];

function PanelPage() {
  const staff = useIsStaff();
  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar />
      {staff.data === false ? <NoAccess /> : <Panel />}
    </div>
  );
}

function Panel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todas" | Mode>("todas");
  const [, tick] = useState(0);
  const prevWaiting = useRef<Set<string> | null>(null);

  const convs = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("*").order("last_message_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`panel-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => qc.invalidateQueries({ queryKey: ["conversations"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
        const cid = (p.new as Message | undefined)?.conversation_id;
        qc.invalidateQueries({ queryKey: cid ? ["messages", cid] : ["messages"] });
      })
      .subscribe();
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [qc]);

  // Sound + toast when a conversation starts waiting for the team.
  useEffect(() => {
    if (!convs.data) return;
    const waiting = new Set(convs.data.filter((c) => c.mode === "aguardando_humano").map((c) => c.id));
    if (prevWaiting.current) {
      const fresh = convs.data.filter((c) => waiting.has(c.id) && !prevWaiting.current!.has(c.id));
      if (fresh.length) {
        beep();
        for (const c of fresh) toast.warning(`Agora é com você: ${c.contact_name ?? formatPhone(c.wa_phone)}`, { description: c.handoff_reason ?? undefined, action: { label: "Abrir", onClick: () => setSelected(c.id) } });
      }
    }
    prevWaiting.current = waiting;
  }, [convs.data]);

  const list = useMemo(() => {
    const all = convs.data ?? [];
    const filtered = filter === "todas" ? all : all.filter((c) => c.mode === filter);
    // Waiting conversations float to the top.
    return [...filtered].sort((a, b) => Number(b.mode === "aguardando_humano") - Number(a.mode === "aguardando_humano"));
  }, [convs.data, filter]);
  const waitingCount = (convs.data ?? []).filter((c) => c.mode === "aguardando_humano").length;
  const current = convs.data?.find((c) => c.id === selected) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[340px] shrink-0 flex-col border-r bg-card">
        {waitingCount > 0 && (
          <button onClick={() => setFilter("aguardando_humano")} className="m-3 flex items-center gap-3 rounded-xl bg-status-wait-soft p-3 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-status-wait text-primary-foreground animate-pulse-ring"><Bell className="h-4 w-4" /></span>
            <span>
              <span className="block text-sm font-semibold text-status-wait">Agora é com você</span>
              <span className="block text-xs text-muted-foreground">{waitingCount} {waitingCount === 1 ? "conversa aguardando" : "conversas aguardando"}</span>
            </span>
          </button>
        )}
        <div className="flex gap-1 overflow-x-auto px-3 pb-2 pt-3">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors", filter === f.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {convs.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
          {!convs.isLoading && list.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma conversa ainda. Quando um lead mandar mensagem no WhatsApp, ela aparece aqui.
            </div>
          )}
          {list.map((c) => {
            const meta = MODE_META[c.mode as Mode];
            return (
              <button key={c.id} onClick={() => setSelected(c.id)} className={cn("flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted", selected === c.id && "bg-accent")}>
                <span className="mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                  {(c.contact_name ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.contact_name ?? formatPhone(c.wa_phone)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.last_message_at)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{c.last_message_preview}</span>
                  <span className={cn("mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", meta.chip)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} /> {meta.label}
                    {c.mode === "aguardando_humano" && c.handoff_at && <span>· há {timeAgo(c.handoff_at)}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>
      {current ? <ConversationView conv={current} key={current.id} /> : (
        <div className="flex flex-1 items-center justify-center bg-chat-bg">
          <div className="max-w-xs text-center">
            <Sparkles className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-3 text-xl font-semibold">Escolha uma conversa</h2>
            <p className="mt-1 text-sm text-muted-foreground">A IA faz o primeiro contato e te avisa aqui quando for a sua vez.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusTicks({ m }: { m: Message }) {
  if (m.direction !== "out") return null;
  if (m.status === "failed") return <X className="h-3 w-3 text-destructive" />;
  if (m.status === "read") return <CheckCheck className="h-3 w-3 text-status-human" />;
  if (m.status === "delivered") return <CheckCheck className="h-3 w-3" />;
  return <Check className="h-3 w-3" />;
}

function ConversationView({ conv }: { conv: Conversation }) {
  const qc = useQueryClient();
  const send = useServerFn(sendHumanReply);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const msgs = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at", { ascending: true }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs.data?.length]);

  async function setMode(mode: Mode) {
    const patch: Partial<Conversation> = { mode };
    if (mode === "ia") Object.assign(patch, { ai_replies: 0, handoff_reason: null, handoff_at: null });
    const { error } = await supabase.from("conversations").update(patch).eq("id", conv.id);
    if (error) toast.error("Não foi possível atualizar", { description: error.message });
    qc.invalidateQueries({ queryKey: ["conversations"] });
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await send({ data: { conversationId: conv.id, body: text } });
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
    } catch (err) {
      toast.error(String((err as Error).message));
    } finally {
      setSending(false);
    }
  }

  const meta = MODE_META[conv.mode as Mode];
  const hoursSince = conv.last_inbound_at ? (Date.now() - new Date(conv.last_inbound_at).getTime()) / 3.6e6 : 0;

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b bg-card px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">{conv.contact_name ?? formatPhone(conv.wa_phone)}</h2>
            <p className="text-xs text-muted-foreground">{formatPhone(conv.wa_phone)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", meta.chip)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} /> {meta.label}
            </span>
            {conv.mode !== "humano" && conv.mode !== "encerrada" && (
              <Button size="sm" className="rounded-full" onClick={() => setMode("humano")}><Hand className="h-4 w-4" /> Assumir conversa</Button>
            )}
            {conv.mode !== "ia" && conv.mode !== "encerrada" && (
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setMode("ia")}><Bot className="h-4 w-4" /> Devolver para a IA</Button>
            )}
            {conv.mode !== "encerrada" ? (
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setMode("encerrada")}>Encerrar</Button>
            ) : (
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setMode("humano")}><RotateCcw className="h-4 w-4" /> Reabrir</Button>
            )}
          </div>
        </div>

        {conv.mode === "aguardando_humano" && (
          <div className="flex items-center gap-3 border-b bg-status-wait-soft px-5 py-2.5 text-sm">
            <Bell className="h-4 w-4 text-status-wait" />
            <span className="font-semibold text-status-wait">Agora é com você.</span>
            <span className="text-muted-foreground">{conv.handoff_reason}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-chat-bg px-6 py-5">
          {msgs.data?.map((m) => {
            const out = m.direction === "out";
            return (
              <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-soft", out ? "rounded-br-sm" : "rounded-bl-sm", m.sender === "lead" && "bg-bubble-lead", m.sender === "ia" && "bg-bubble-ia", m.sender === "humano" && "bg-bubble-human")}>
                  {m.sender !== "lead" && (
                    <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                      {m.sender === "ia" ? <><Bot className="h-3 w-3" /> IA</> : <><User className="h-3 w-3" /> Equipe</>}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    <StatusTicks m={m} />
                  </div>
                  {m.status === "failed" && <p className="mt-1 text-[11px] text-destructive">Não entregue</p>}
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>

        <form onSubmit={submit} className="border-t bg-card p-3">
          {hoursSince > 24 && (
            <p className="mb-2 text-xs text-status-wait">Já passou de 24h desde a última mensagem do lead. O WhatsApp pode bloquear mensagens livres.</p>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder={conv.mode === "ia" ? "Responder aqui assume a conversa e pausa a IA" : "Escreva sua resposta…"}
              className="min-h-[44px] resize-none"
              rows={1}
            />
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={sending || !text.trim()}><Send className="h-4 w-4" /></Button>
          </div>
        </form>
      </section>

      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l bg-card p-5 xl:block">
        <h3 className="text-base font-semibold">Resumo do lead</h3>
        <p className="text-xs text-muted-foreground">Preenchido pela IA durante a conversa</p>
        <dl className="mt-4 space-y-4 text-sm">
          <Field label="Procedimento de interesse" value={conv.procedure} />
          <Field label="Já fez antes?" value={conv.experience} />
          <Field label="O que busca" value={conv.goal} />
          <Field label="Motivo da passagem" value={conv.handoff_reason} />
          <Field label="Respostas da IA" value={String(conv.ai_replies)} />
          <Field label="Primeiro contato" value={new Date(conv.created_at).toLocaleString("pt-BR")} />
        </dl>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5", !value && "text-muted-foreground")}>{value || "—"}</dd>
    </div>
  );
}
