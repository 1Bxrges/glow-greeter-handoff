import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { runTick } = await import("@/lib/webhook-processor.server");
        const { runInBackground } = await import("@/lib/request-context.server");
        // The scheduler hangs up after a few seconds; AI replies run after the response.
        await runInBackground(() => runTick(db));
        return Response.json({ ok: true });
      },
    },
  },
});
