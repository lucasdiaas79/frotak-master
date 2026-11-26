import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/partners")({
  head: () => ({
    meta: [
      { title: "FrotaK Partner Hub" },
      {
        name: "description",
        content: "Portal visual para parceiros, leads, comissoes e enablement.",
      },
    ],
  }),
  component: () => <WorkspaceVisualPage workspace={getWorkspaceByKey("partners")} />,
});
