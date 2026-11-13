import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, MessageCircle, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function TopBar() {
  const navigate = useNavigate();
  const linkCls = "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-primary-foreground/85 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground";
  // Active item follows the brand's pill button: white with orange text.
  const activeCls = "bg-primary-foreground text-primary shadow-soft hover:bg-primary-foreground hover:text-primary";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between bg-primary px-4 text-primary-foreground">
      <div className="flex items-center gap-6">
        <span className="flex items-center gap-3">
          <img src="/brand/buzzina-wordmark-white.png" alt="Buzzina" className="h-7 w-auto" />
          <span className="hidden border-l border-primary-foreground/30 pl-3 text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground/85 sm:inline">Atendimento IA</span>
        </span>
        <nav className="flex items-center gap-1">
          <Link to="/painel" className={linkCls} activeProps={{ className: activeCls }}>
            <MessageCircle className="h-4 w-4" /> Atendimentos
          </Link>
          <Link to="/configuracoes" className={linkCls} activeProps={{ className: activeCls }}>
            <Settings className="h-4 w-4" /> Configurações
          </Link>
        </nav>
      </div>
      <Button variant="ghost" size="sm" className="rounded-full text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>
        <LogOut className="h-4 w-4" /> Sair
      </Button>
    </header>
  );
}
