import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useIsStaff() {
  return useQuery({
    queryKey: ["is-staff"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "staff").maybeSingle();
      return !!data;
    },
  });
}

export function NoAccess() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <h2 className="text-xl font-semibold">Acesso pendente</h2>
        <p className="mt-2 text-sm text-muted-foreground">Sua conta ainda não faz parte da equipe da clínica. Peça para a responsável liberar seu acesso.</p>
      </div>
    </div>
  );
}
