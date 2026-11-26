import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "FrotaK Status" },
      { name: "description", content: "Pagina visual de status, uptime, latencia e incidentes." },
    ],
  }),
  component: () => <WorkspaceVisualPage workspace={getWorkspaceByKey("status")} />,
});
