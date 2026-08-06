import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/academy/$module")({
  component: AcademyModule,
});

function AcademyModule() {
  const { module } = Route.useParams();
  return <WorkspaceVisualPage workspace={getWorkspaceByKey("academy")} moduleSlug={module} />;
}
