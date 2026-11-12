import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deliveryId = request.headers.get("X-Lovable-Delivery");
        const event = request.headers.get("X-Lovable-Event");
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("Server configuration error", { status: 500 });
        let payload: unknown;
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret,
            maxBodyBytes: 4 * 1024 * 1024,
          });
          payload = verified.payload;
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!deliveryId || !event) return new Response("Missing headers", { status: 400 });

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { processStoredEvent, recoverPending } = await import("@/lib/webhook-processor.server");

        const { error: insErr } = await db
          .from("whatsapp_webhook_events")
          .upsert({ delivery_id: deliveryId, event, payload: payload as any }, { onConflict: "delivery_id", ignoreDuplicates: true });
        if (insErr) {
          console.error(insErr);
          return new Response("Storage error", { status: 500 });
        }
        const { data: row, error } = await db
          .from("whatsapp_webhook_events")
          .select("id, event, payload, attempts, processed_at")
          .eq("delivery_id", deliveryId)
          .single();
        if (error || !row) return new Response("Storage error", { status: 500 });
        if (row.processed_at) return new Response("ok");

        // The event is durably stored: answer the gateway right away (it cancels requests
        // after ~5s) and let the AI reply run after the response.
        const { runInBackground } = await import("@/lib/request-context.server");
        await runInBackground(async () => {
          await processStoredEvent(db, row);
          await recoverPending(db, row.id);
        });
        return new Response("ok");
      },
    },
  },
});
