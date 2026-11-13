import { createFileRoute } from "@tanstack/react-router";

// Optional schedule target: call every minute so the "wait" message goes out on time
// even when no webhook arrives and nobody has the panel open.
export const Route = createFileRoute("/api/public/cron/followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendDueFollowups, processDueReplies } = await import("@/lib/webhook-processor.server");
        const { runInBackground } = await import("@/lib/request-context.server");
        // The scheduler hangs up after a few seconds: the AI work runs after the response.
        await runInBackground(async () => {
          await processDueReplies(supabaseAdmin);
          await sendDueFollowups(supabaseAdmin);
        });
        return Response.json({ ok: true });
      },
    },
  },
});
