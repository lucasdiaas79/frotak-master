import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/developers")({
  head: () => ({
    meta: [
      { title: "FrotaK Developer Portal" },
      {
        name: "description",
        content: "Portal visual para APIs, SDKs, tokens, webhooks e exemplos.",
      },
    ],
  }),
  component: () => <WorkspaceVisualPage workspace={getWorkspaceByKey("developers")} />,
});
