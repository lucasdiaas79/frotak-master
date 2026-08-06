import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/status/$module")({
  component: StatusModule,
});

function StatusModule() {
  const { module } = Route.useParams();
  return <WorkspaceVisualPage workspace={getWorkspaceByKey("status")} moduleSlug={module} />;
}
