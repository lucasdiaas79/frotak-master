import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/academy")({
  head: () => ({
    meta: [
      { title: "FrotaK Academy" },
      { name: "description", content: "Portal visual de cursos, certificacoes e progresso." },
    ],
  }),
  component: () => <WorkspaceVisualPage workspace={getWorkspaceByKey("academy")} />,
});
