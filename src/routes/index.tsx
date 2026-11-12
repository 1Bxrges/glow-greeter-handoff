import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/painel" });
  },
  head: () => ({
    meta: [
      { title: "Secretária IA — Atendimentos da clínica" },
      { name: "description", content: "Acompanhe em tempo real o primeiro contato da IA com os leads no WhatsApp." },
      { property: "og:title", content: "Secretária IA — Atendimentos da clínica" },
      { property: "og:description", content: "Acompanhe em tempo real o primeiro contato da IA com os leads no WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
