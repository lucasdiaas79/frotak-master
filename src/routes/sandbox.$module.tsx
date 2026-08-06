import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/sandbox/$module")({
  component: SandboxModule,
});

function SandboxModule() {
  const { module } = Route.useParams();
  return <WorkspaceVisualPage workspace={getWorkspaceByKey("sandbox")} moduleSlug={module} />;
}
