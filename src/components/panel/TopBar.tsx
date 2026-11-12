import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, MessageCircle, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function TopBar() {
  const navigate = useNavigate();
  const linkCls = "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-6">
        <span className="font-display text-lg font-semibold text-foreground">Secretária <span className="text-primary">IA</span></span>
        <nav className="flex items-center gap-1">
          <Link to="/painel" className={linkCls} activeProps={{ className: "bg-accent text-accent-foreground" }}>
            <MessageCircle className="h-4 w-4" /> Atendimentos
          </Link>
          <Link to="/configuracoes" className={linkCls} activeProps={{ className: "bg-accent text-accent-foreground" }}>
            <Settings className="h-4 w-4" /> Configurações
          </Link>
        </nav>
      </div>
      <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>
        <LogOut className="h-4 w-4" /> Sair
      </Button>
    </header>
  );
}
