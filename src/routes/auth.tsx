import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Buzzina" },
      { name: "description", content: "Acesso da equipe da clínica ao painel de atendimentos." },
      { property: "og:title", content: "Entrar — Buzzina" },
      { property: "og:description", content: "Acesso da equipe da clínica ao painel de atendimentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel" });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/painel" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error("Não foi possível entrar", { description: error.message });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (error) toast.error("Não foi possível criar a conta", { description: error.message });
      else if (!data.session) toast.success("Confira seu e-mail para confirmar a conta.");
    }
    setBusy(false);
  }

  async function social(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) toast.error("Não foi possível entrar", { description: String(result.error.message ?? result.error) });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Brand panel: orange with the symbol as a watermark, like Buzzina's own pieces. */}
      <aside className="relative flex shrink-0 flex-col items-center justify-center overflow-hidden bg-primary px-6 py-10 text-center text-primary-foreground lg:w-[44%] lg:py-16">
        <img src="/brand/buzzina-symbol-white.png" alt="" aria-hidden className="pointer-events-none absolute -left-10 -top-12 w-56 -rotate-12 opacity-10 lg:w-80" />
        <img src="/brand/buzzina-symbol-white.png" alt="" aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 w-64 rotate-[165deg] opacity-10 lg:w-96" />
        <p className="relative text-[11px] font-medium uppercase tracking-[0.3em] text-primary-foreground/90">Assessoria de marketing</p>
        <img src="/brand/buzzina-symbol-white.png" alt="" aria-hidden className="relative mt-6 hidden h-28 w-auto lg:block" />
        <img src="/brand/buzzina-wordmark-white.png" alt="Buzzina" className="relative mt-4 h-10 w-auto lg:h-14" />
        <h1 className="relative mt-6 max-w-xs text-2xl font-bold leading-tight lg:mt-10 lg:text-4xl">Atendimento por IA para a sua clínica.</h1>
        <p className="relative mt-3 max-w-xs text-sm text-primary-foreground/90">A IA faz o primeiro contato no WhatsApp e te chama na hora de assumir.</p>
        <p className="relative mt-10 hidden text-[11px] font-medium uppercase tracking-[0.3em] text-primary-foreground/90 lg:block">Referência em clínicas</p>
      </aside>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Entrar no painel</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe as conversas e assuma quando a IA te chamar.</p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="space-y-2">
            <button type="button" onClick={() => social("google")} className="flex h-10 w-full items-center justify-center gap-[10px] rounded-full border border-[#747775] bg-[#FFFFFF] px-3 text-sm font-medium text-[#1F1F1F]">
              <GoogleLogo /> Continuar com Google
            </button>
            <button type="button" className="lovable-auth-button w-full" onClick={() => social("lovable")}>
              Continue with Lovable
            </button>
          </div>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou com e-mail <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full rounded-full" disabled={busy}>
              {mode === "in" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground">
            {mode === "in" ? "Primeiro acesso? Criar conta" : "Já tenho conta. Entrar"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
