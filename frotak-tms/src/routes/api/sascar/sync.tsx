import { createFileRoute } from "@tanstack/react-router";
import { handleSascarSyncRequest } from "@/modules/frotak-tracking/api/sascarSyncRoute";

export const Route = createFileRoute("/api/sascar/sync")({
  server: {
    handlers: {
      POST: ({ request }) => handleSascarSyncRequest(request),
    },
  },
});
