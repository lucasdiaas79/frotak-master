import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/bi/$module")({
  component: BiModule,
});

function BiModule() {
  const { module } = Route.useParams();
  return <WorkspaceVisualPage workspace={getWorkspaceByKey("bi")} moduleSlug={module} />;
}
