import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/sandbox")({
  head: () => ({
    meta: [
      { title: "FrotaK Sandbox · Ambiente de Testes" },
      { name: "description", content: "Workspace visual de homologacao do ecossistema FrotaK." },
    ],
  }),
  component: () => <WorkspaceVisualPage workspace={getWorkspaceByKey("sandbox")} />,
});
