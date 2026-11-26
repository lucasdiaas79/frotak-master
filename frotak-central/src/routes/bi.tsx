import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/bi")({
  head: () => ({
    meta: [
      { title: "FrotaK BI" },
      {
        name: "description",
        content: "Modulo visual de Business Intelligence do ecossistema FrotaK.",
      },
    ],
  }),
  component: () => <WorkspaceVisualPage workspace={getWorkspaceByKey("bi")} />,
});
