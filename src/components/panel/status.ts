export type Mode = "ia" | "aguardando_humano" | "humano" | "encerrada";

export const MODE_META: Record<Mode, { label: string; dot: string; chip: string }> = {
  ia: { label: "IA atendendo", dot: "bg-status-ia", chip: "bg-status-ia-soft text-status-ia" },
  aguardando_humano: { label: "Aguardando você", dot: "bg-status-wait", chip: "bg-status-wait-soft text-status-wait" },
  humano: { label: "Você atendendo", dot: "bg-status-human", chip: "bg-status-human-soft text-status-human" },
  encerrada: { label: "Encerrada", dot: "bg-status-closed", chip: "bg-status-closed-soft text-status-closed" },
};

export function timeAgo(iso: string | null) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}`;
  return `+${d}`;
}

export function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch {}
}
