import { createFileRoute } from "@tanstack/react-router";
import { getWorkspaceUsersServerDiagnosticsSnapshot } from "@/lib/workspaceUsers";

export const Route = createFileRoute("/api/workspace-users-diagnostics")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(getWorkspaceUsersServerDiagnosticsSnapshot());
      },
    },
  },
});
